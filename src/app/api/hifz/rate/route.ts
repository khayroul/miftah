import { NextResponse } from "next/server";
import { applyRating } from "@/lib/fsrs";
import { dbRowToCard, cardToDbRow } from "@/lib/hifz/fsrs-bridge";
import {
  getProgressById,
  updateFsrsFields,
  updateHifzStatus,
  demoteManzilToSabqi,
} from "@/lib/hifz/study-progress";
import { logReview } from "@/lib/hifz/review-log";
import { getOptionalAuthUser } from "@/lib/auth";
import type { FsrsRating, FsrsState } from "@/types/database";
import type { Grade } from "@/lib/fsrs";

interface RateBody {
  progressId: number;
  rating: FsrsRating;
  block: "sabqi" | "sabak" | "manzil";
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: RateBody;
  try {
    body = (await request.json()) as RateBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { progressId, rating, block } = body;
  if (
    !Number.isInteger(progressId) ||
    progressId <= 0 ||
    ![1, 2, 3, 4].includes(rating) ||
    !["sabqi", "sabak", "manzil"].includes(block)
  ) {
    return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
  }

  try {
    const user = await getOptionalAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = user.id;
    const progress = await getProgressById(progressId);
    if (!progress) {
      return NextResponse.json({ error: "Progress not found" }, { status: 404 });
    }
    if (progress.user_id !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const now = new Date();
    const card = dbRowToCard(progress);
    const result = applyRating(card, rating as Grade, now);
    const newCard = result.card;
    const newFields = cardToDbRow(newCard);

    const stateBefore = progress.state as FsrsState;
    const stateAfter = newCard.state as FsrsState;

    await updateFsrsFields(progressId, newFields);

    // Status transitions
    if (block === "sabak" && rating >= 3 && progress.reps === 0) {
      // First Good/Easy on a sabak item → promote to sabqi
      await updateHifzStatus(progressId, "sabqi", now);
    } else if (block === "manzil" && rating === 1) {
      // Again on manzil → demote to sabqi for reinforcement
      await demoteManzilToSabqi(progressId, now);
    }

    await logReview({
      userId,
      itemId: progress.ayah_id,
      rating,
      stateBefore,
      stateAfter,
      elapsedDays: newCard.elapsed_days,
      scheduledDays: newCard.scheduled_days,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[hifz/rate] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
