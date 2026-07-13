import { supabaseServer } from "@/data/supabase/server";
import { TOP_FAHAM_WORD_LIMIT } from "@/features/faham/domain/config";
import { getTopFahamWordIds } from "./faham-vocabulary";

export async function getFahamStats(
  userId: string,
  wordLimit = TOP_FAHAM_WORD_LIMIT,
) {
  const topWordIds = await getTopFahamWordIds(wordLimit);
  if (topWordIds.length === 0) {
    return {
      wordBank: 0,
      mastered: 0,
      learning: 0,
      dueToday: 0,
      retentionRate7d: 0,
    };
  }
  const [
    { count: encounteredCount },
    { data: progressStats, error: progressError },
    { data: retentionData, error: retentionError },
  ] = await Promise.all([
    supabaseServer
      .from("v_vocab_exposure_summary")
      .select("word_id", { count: "exact", head: true })
      .eq("user_id", userId)
      .in("word_id", topWordIds),
    supabaseServer
      .from("vocab_progress")
      .select("word_id, is_mastered, reps, due")
      .eq("user_id", userId)
      .in("word_id", topWordIds),
    supabaseServer
      .from("review_log")
      .select("rating")
      .eq("user_id", userId)
      .eq("review_type", "vocab")
      .gte("reviewed_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
  ]);

  if (progressError) throw progressError;
  if (retentionError) throw retentionError;

  const now = new Date().toISOString();
  let masteredCount = 0;
  let learningCount = 0;
  let dueTodayCount = 0;

  for (const row of (progressStats ?? []) as Array<{ is_mastered: boolean; reps: number; due: string }>) {
    if (row.is_mastered) {
      masteredCount++;
    } else {
      if (row.reps > 0) {
        learningCount++;
      }
      if (row.due <= now) {
        dueTodayCount++;
      }
    }
    // New (reps == 0) cards that were already assigned progress but not yet mastered are learning?
    // Usually reps=0 means "New".
  }

  const ratings = Array.isArray(retentionData) ? retentionData : [];
  const successCount = ratings.filter((r) => r && typeof r.rating === 'number' && r.rating > 1).length;
  const totalCount = ratings.length;
  const retentionRate = totalCount > 0 ? successCount / totalCount : 0;

  return {
    wordBank: encounteredCount ?? 0,
    mastered: masteredCount,
    learning: learningCount,
    dueToday: dueTodayCount,
    retentionRate7d: retentionRate || 0,
  };
}
