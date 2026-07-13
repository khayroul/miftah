import { NextResponse, after } from "next/server";
import { revalidateTag } from "next/cache";
import { recomputeAndStoreSnapshot } from "@/lib/homeDashboardDb";
import { applyRating } from "@/lib/fsrs";
import { dbRowToCard, cardToDbRow } from "@/lib/hifz/fsrs-bridge";
import {
  getProgressById,
  updateFsrsFields,
  updateHifzStatus,
  demoteManzilToSabqi,
} from "@/lib/hifz/study-progress";
import { logReview } from "@/lib/hifz/review-log";
import { getOptionalAuthUser } from "@/lib/auth-server";
import { isRecentlyReviewed } from "@/lib/faham/idempotency";
import type { FsrsRating, FsrsState } from "@/types/database";
import type { Grade } from "@/lib/fsrs";
import { recordActivityEvent } from "@/lib/activityEvents";

interface RatingEntry {
  progressId: number;
  rating: 1 | 3;
  block: "sabak" | "sabqi" | "manzil";
}

interface RateBatchBody {
  ratings: RatingEntry[];
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: RateBatchBody;
  try {
    body = (await request.json()) as RateBatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { ratings } = body;
  if (!Array.isArray(ratings) || ratings.length === 0 || ratings.length > 50) {
    return NextResponse.json({ error: "Invalid ratings array" }, { status: 400 });
  }

  for (const entry of ratings) {
    if (
      !Number.isInteger(entry.progressId) ||
      entry.progressId <= 0 ||
      ![1, 3].includes(entry.rating) ||
      !["sabak", "sabqi", "manzil"].includes(entry.block)
    ) {
      return NextResponse.json({ error: "Invalid rating entry" }, { status: 400 });
    }
  }

  try {
    const user = await getOptionalAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = user.id;
    const now = new Date();
    const results: Array<{ progressId: number; ok: boolean; deduped?: boolean }> = [];

    for (const entry of ratings) {
      try {
        const progress = await getProgressById(entry.progressId);
        if (!progress || progress.user_id !== userId) {
          results.push({ progressId: entry.progressId, ok: false });
          continue;
        }

        // Idempotency guard (B3): a batch retry after a partial failure re-sends
        // the whole batch. Entries that already applied on the prior attempt have
        // last_review within the dedup window — skip them so applyRating isn't
        // double-applied. last_review is null on a card's first-ever rating, so
        // first ratings always go through; genuinely-failed entries retry cleanly.
        if (isRecentlyReviewed(progress.last_review, now)) {
          results.push({ progressId: entry.progressId, ok: true, deduped: true });
          continue;
        }

        const card = dbRowToCard(progress);
        const result = applyRating(card, entry.rating as Grade, now);
        const newCard = result.card;
        const newFields = cardToDbRow(newCard);

        const stateBefore = progress.state as FsrsState;
        const stateAfter = newCard.state as FsrsState;

        await updateFsrsFields(entry.progressId, newFields);

        if (entry.block === "sabak" && entry.rating >= 3 && progress.reps === 0) {
          await updateHifzStatus(entry.progressId, "sabqi", now);
        } else if (entry.block === "manzil" && entry.rating === 1) {
          await demoteManzilToSabqi(entry.progressId, now);
        }

        await logReview({
          userId,
          itemId: progress.ayah_id,
          rating: entry.rating as FsrsRating,
          stateBefore,
          stateAfter,
          elapsedDays: newCard.elapsed_days,
          scheduledDays: newCard.scheduled_days,
        });

        await recordActivityEvent({
          activityType: "hifz_ayah_reviewed",
          entityId: progress.ayah_id,
          entityKey: String(progress.ayah_id),
          entityType: "ayah",
          metadata: {
            block: entry.block,
            progressId: entry.progressId,
            rating: entry.rating,
          },
          userId,
        });

        results.push({ progressId: entry.progressId, ok: true });
      } catch {
        results.push({ progressId: entry.progressId, ok: false });
      }
    }

    revalidateTag("hifz", "max");
    revalidateTag("home-dashboard", "max");
    after(() => recomputeAndStoreSnapshot(userId));
    return NextResponse.json({ ok: true, results });
  } catch (err) {
    console.error("[hifz/rate-batch] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
