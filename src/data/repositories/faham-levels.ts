import { FAHAM_LEVEL_WORD_LIMITS } from "@/features/faham/domain/config";
import {
  deriveFahamLevelState,
  type FahamLevelState,
} from "@/features/faham/domain/levels";
import { supabaseServer } from "@/data/supabase/server";
import { getTopFahamWordIds } from "./faham-vocabulary";

type SupabaseServerClient = typeof supabaseServer;

async function countFoundWords(
  supabase: SupabaseServerClient,
  userId: string,
  wordIds: number[],
): Promise<number> {
  if (wordIds.length === 0) {
    return 0;
  }

  const { count, error } = await supabase
    .from("v_vocab_exposure_summary")
    .select("word_id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gt("reading_event_count", 0)
    .in("word_id", wordIds);
  if (error) {
    throw error;
  }

  return count ?? 0;
}

async function countMasteredWords(
  supabase: SupabaseServerClient,
  userId: string,
  wordIds: number[],
): Promise<number> {
  if (wordIds.length === 0) {
    return 0;
  }

  const { count, error } = await supabase
    .from("vocab_progress")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_mastered", true)
    .in("word_id", wordIds);
  if (error) {
    throw error;
  }

  return count ?? 0;
}

export async function getFahamLevelState(
  userId: string,
): Promise<FahamLevelState> {
  const metricsInput = await Promise.all(
    FAHAM_LEVEL_WORD_LIMITS.map(async (wordLimit) => {
      const topWordIds = await getTopFahamWordIds(wordLimit);
      const [foundCount, masteredCount] = await Promise.all([
        countFoundWords(supabaseServer, userId, topWordIds),
        countMasteredWords(supabaseServer, userId, topWordIds),
      ]);
      return { foundCount, masteredCount, wordLimit };
    }),
  );

  return deriveFahamLevelState(metricsInput);
}
