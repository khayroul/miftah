import { NextResponse } from "next/server";
import type { Grade } from "@/lib/fsrs";
import { applyRating } from "@/lib/fsrs";
import { dbRowToCard, cardToDbRow } from "@/lib/hifz/fsrs-bridge";
import { logVocabReview } from "@/lib/faham/review-log";
import { fahamRateRequestSchema } from "@/lib/faham/schemas";
import { getOptionalAuthUser } from "@/lib/auth-server";
import {
  getVocabProgressById,
  updateVocabProgressAfterReview,
} from "@/lib/faham/vocab-progress";
import type { FsrsState } from "@/types/database";
import { ZodError } from "zod";
import { logUserActivity } from "@/lib/activity";

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

    const progress = await getVocabProgressById(body.progressId);
    if (!progress) {
      return NextResponse.json({ error: "Progress not found" }, { status: 404 });
    }
    if (progress.user_id !== userId) {
      return NextResponse.json({ error: "Progress not found" }, { status: 404 });
    }

    const now = new Date();
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
    
    // Log global activity for streak tracking
    await logUserActivity(userId, "faham", { word_id: progress.word_id, rating: body.rating });

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
