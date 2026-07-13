import { supabaseServer } from "@/lib/supabase-server";
import type { FsrsRating, FsrsState } from "@/types/database";

export async function logReview(params: {
  userId: string;
  itemId: number;
  rating: FsrsRating;
  stateBefore: FsrsState;
  stateAfter: FsrsState;
  elapsedDays: number;
  scheduledDays: number;
}): Promise<void> {
  const { error } = await supabaseServer.from("review_log").insert({
    user_id: params.userId,
    review_type: "ayah",
    item_id: params.itemId,
    rating: params.rating,
    state_before: params.stateBefore,
    state_after: params.stateAfter,
    elapsed_days: params.elapsedDays,
    scheduled_days: params.scheduledDays,
    reviewed_at: new Date().toISOString(),
  });
  if (error) throw error;
}
