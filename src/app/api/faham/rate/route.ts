import { NextResponse, after } from "next/server";
import { revalidateTag } from "next/cache";
import { recomputeAndStoreSnapshot } from "@/features/home/server";
import type { Grade } from "@/lib/fsrs";
import { applyRating } from "@/lib/fsrs";
import { dbRowToCard, cardToDbRow } from "@/features/hifz/domain/fsrs-bridge";
import { logVocabReview } from "@/data/repositories/faham-review";
import {
  fahamRateRequestSchema,
  isRecentlyReviewed,
} from "@/features/faham/server";
import { getOptionalAuthUser } from "@/lib/auth-server";
import {
  getOrCreateVocabProgress,
  getVocabProgressById,
  updateVocabProgressAfterReview,
} from "@/data/repositories/faham-progress";
import type { FsrsState } from "@/types/database";
import { ZodError } from "zod";
import { recordActivityEvent } from "@/lib/activityEvents";

export async function POST(request: Request): Promise<NextResponse> {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const body = fahamRateRequestSchema.parse(rawBody);
    const user = await getOptionalAuthUser();
    const userId = user?.id;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const progress = "progressId" in body
      ? await getVocabProgressById(body.progressId)
      : await getOrCreateVocabProgress(userId, body.wordId);
    if (!progress) {
      return NextResponse.json({ error: "Progress not found" }, { status: 404 });
    }
    if (progress.user_id !== userId) {
      return NextResponse.json({ error: "Progress not found" }, { status: 404 });
    }

    const now = new Date();

    // Idempotency guard (B1): a duplicate submit of the same review — from the
    // re-entrant auto-advance timer, a double "Kad seterusnya" click, or a
    // network retry — arrives within the dedup window. No-op so we don't
    // re-apply the rating + streak increment and falsely flip is_mastered
    // (correct_streak >= 2). last_review is null on a card's first-ever rating,
    // so first ratings are never deduped. Legit re-reviews are minutes+ apart.
    if (isRecentlyReviewed(progress.last_review, now)) {
      return NextResponse.json({
        deduped: true,
        due: progress.due,
        ok: true,
        progressId: progress.id,
        state: progress.state,
      });
    }

    const card = dbRowToCard(progress);
    const result = applyRating(card, body.rating as Grade, now);
    const nextCard = result.card;

    await updateVocabProgressAfterReview(progress.id, {
      ...cardToDbRow(nextCard),
      lastIncorrectAt: body.rating === 1 ? now.toISOString() : null,
      mistakeStreak: body.rating === 1 ? progress.mistake_streak + 1 : 0,
      needsReinforcement: body.rating === 1,
      rating: body.rating,
      currentProgress: progress,
    });
    await logVocabReview({
      elapsedDays: nextCard.elapsed_days,
      itemId: progress.word_id,
      rating: body.rating,
      scheduledDays: nextCard.scheduled_days,
      stateAfter: nextCard.state as FsrsState,
      stateBefore: progress.state as FsrsState,
      userId,
    });

    await recordActivityEvent({
      activityType: "faham_word_reviewed",
      entityId: progress.word_id,
      entityKey: String(progress.word_id),
      entityType: "word",
      metadata: {
        progressId: progress.id,
        rating: body.rating,
      },
      userId,
    });

    revalidateTag("home-dashboard", "max");
    after(() => recomputeAndStoreSnapshot(userId));
    return NextResponse.json({
      due: nextCard.due.toISOString(),
      ok: true,
      progressId: progress.id,
      state: nextCard.state,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid parameters", issues: error.issues },
        { status: 400 },
      );
    }

    console.error("[faham/rate] Error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
