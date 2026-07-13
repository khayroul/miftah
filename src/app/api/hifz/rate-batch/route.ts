import { NextResponse, after } from "next/server";
import { revalidateTag } from "next/cache";
import { recomputeAndStoreSnapshot } from "@/features/home/server";
import { applyRating } from "@/shared/fsrs";
import { dbRowToCard, cardToDbRow } from "@/shared/fsrsBridge";
import {
  getProgressById,
  updateFsrsFields,
  updateHifzStatus,
  demoteManzilToSabqi,
} from "@/data/repositories/hifz";
import { logReview } from "@/data/repositories/hifz";
import { dispatchGroupedByKey } from "@/features/hifz/domain/rateBatchDispatch";
import { getOptionalAuthUser } from "@/features/auth/server";
import { isRecentlyReviewed } from "@/features/faham/server";
import type { FsrsRating, FsrsState } from "@/shared/types/database";
import type { Grade } from "@/shared/fsrs";
import { recordActivityEvent } from "@/data/repositories/activity";

interface RatingEntry {
  progressId: number;
  rating: 1 | 3;
  block: "sabak" | "sabqi" | "manzil";
}

interface RateBatchBody {
  ratings: RatingEntry[];
}

type RateResult = { progressId: number; ok: boolean; deduped?: boolean };

/**
 * Applies a single rating entry, preserving the exact per-entry semantics of the
 * original sequential `for` loop: ownership check (progress.user_id !== userId),
 * the RF-2/B3 idempotency dedup guard (isRecentlyReviewed), the FSRS update, the
 * conditional hifz-status transition, the review-log write, the activity-event
 * write, and a try/catch that degrades a single entry's failure to `{ ok: false }`
 * without aborting the batch.
 */
async function applyRatingEntry(
  entry: RatingEntry,
  userId: string,
  now: Date,
): Promise<RateResult> {
  try {
    const progress = await getProgressById(entry.progressId);
    if (!progress || progress.user_id !== userId) {
      return { progressId: entry.progressId, ok: false };
    }

    // Idempotency guard (B3): a batch retry after a partial failure re-sends
    // the whole batch. Entries that already applied on the prior attempt have
    // last_review within the dedup window — skip them so applyRating isn't
    // double-applied. last_review is null on a card's first-ever rating, so
    // first ratings always go through; genuinely-failed entries retry cleanly.
    if (isRecentlyReviewed(progress.last_review, now)) {
      return { progressId: entry.progressId, ok: true, deduped: true };
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

    return { progressId: entry.progressId, ok: true };
  } catch {
    return { progressId: entry.progressId, ok: false };
  }
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

    // Entries are independent DB rows (keyed by progressId) — process them
    // concurrently instead of the old serial for-loop (~4-5 round-trips ×
    // up to 50 entries). dispatchGroupedByKey runs distinct progressIds
    // fully in parallel while any group sharing a progressId (not sent by
    // any current caller — each derives `ratings` from a page/chunk's
    // distinct queue items — but not rejected by validation above either)
    // replays sequentially in original order, so the RF-2 idempotency dedup
    // still sees the prior write the way the old for-loop guaranteed it
    // would. Result order always matches request order.
    const results = await dispatchGroupedByKey(
      ratings,
      (entry) => entry.progressId,
      (entry) => applyRatingEntry(entry, userId, now),
    );

    revalidateTag("hifz", "max");
    revalidateTag("home-dashboard", "max");
    after(() => recomputeAndStoreSnapshot(userId));
    return NextResponse.json({ ok: true, results });
  } catch (err) {
    console.error("[hifz/rate-batch] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
