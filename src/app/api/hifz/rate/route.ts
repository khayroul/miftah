import { NextResponse, after } from "next/server";
import { revalidateTag } from "next/cache";
import { recomputeAndStoreSnapshot } from "@/features/home/server";
import { applyRating } from "@/lib/fsrs";
import { dbRowToCard, cardToDbRow } from "@/features/hifz/domain/fsrs-bridge";
import {
  getProgressById,
  updateFsrsFields,
  updateHifzStatus,
  demoteManzilToSabqi,
} from "@/data/repositories/hifz";
import { logReview } from "@/data/repositories/hifz";
import { getOptionalAuthUser } from "@/lib/auth-server";
import type { FsrsRating, FsrsState } from "@/types/database";
import type { Grade } from "@/lib/fsrs";
import { recordActivityEvent } from "@/lib/activityEvents";

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

    await recordActivityEvent({
      activityType: "hifz_ayah_reviewed",
      entityId: progress.ayah_id,
      entityKey: String(progress.ayah_id),
      entityType: "ayah",
      metadata: {
        block,
        progressId,
        rating,
      },
      userId,
    });

    revalidateTag("hifz", "max");
    revalidateTag("home-dashboard", "max");
    after(() => recomputeAndStoreSnapshot(userId));
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[hifz/rate] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
