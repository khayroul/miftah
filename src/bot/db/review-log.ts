import { supabaseAdmin } from "../supabase-admin.js";
import type { FsrsRating, FsrsState, ReviewLog } from "@/shared/types/database";

export async function logReview(params: {
  userId: string;
  reviewType: "ayah" | "vocab";
  itemId: number;
  rating: FsrsRating;
  stateBefore: FsrsState;
  stateAfter: FsrsState;
  elapsedDays: number;
  scheduledDays: number;
}): Promise<void> {
  const { error } = await supabaseAdmin.from("review_log").insert({
    user_id: params.userId,
    review_type: params.reviewType,
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

export async function getReviewCount(
  userId: string,
  since: Date,
  reviewType?: "ayah" | "vocab",
): Promise<number> {
  let q = supabaseAdmin
    .from("review_log")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("reviewed_at", since.toISOString());
  if (reviewType) q = q.eq("review_type", reviewType);
  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
}

export async function getRecentReviews(
  userId: string,
  limit: number,
): Promise<ReviewLog[]> {
  const { data, error } = await supabaseAdmin
    .from("review_log")
    .select("*")
    .eq("user_id", userId)
    .order("reviewed_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as ReviewLog[];
}
