import { supabaseServer } from "@/lib/supabase-server";
import { newCardDbRow } from "@/lib/hifz/fsrs-bridge";
import type { FsrsFields, VocabProgress } from "@/types/database";

export async function getOrCreateVocabProgress(
  userId: string,
  wordId: number,
): Promise<VocabProgress> {
  const { data } = await supabaseServer
    .from("vocab_progress")
    .select("*")
    .eq("user_id", userId)
    .eq("word_id", wordId)
    .single();

  if (data) {
    return data as VocabProgress;
  }

  const row = { user_id: userId, word_id: wordId, ...newCardDbRow() };
  const { data: created, error } = await supabaseServer
    .from("vocab_progress")
    .insert(row)
    .select()
    .single();
  if (error) {
    throw error;
  }
  return created as VocabProgress;
}

export async function getVocabProgressById(
  id: number,
): Promise<VocabProgress | null> {
  const { data } = await supabaseServer
    .from("vocab_progress")
    .select("*")
    .eq("id", id)
    .single();

  return (data ?? null) as VocabProgress | null;
}

export async function updateVocabFsrs(
  id: number,
  fields: FsrsFields,
): Promise<void> {
  const { error } = await supabaseServer
    .from("vocab_progress")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    throw error;
  }
}

export async function updateVocabProgressAfterReview(
  id: number,
  params: FsrsFields & {
    lastIncorrectAt: string | null;
    mistakeStreak: number;
    needsReinforcement: boolean;
    rating: number;
    currentProgress: VocabProgress;
  },
): Promise<void> {
  const isCorrect = params.rating > 1;
  const newCorrectStreak = isCorrect ? params.currentProgress.correct_streak + 1 : 0;
  const newIncorrectStreak = isCorrect ? 0 : params.currentProgress.incorrect_streak + 1;

  let isMastered = params.currentProgress.is_mastered;
  if (!isMastered && newCorrectStreak >= 2) {
    isMastered = true;
  } else if (isMastered && newIncorrectStreak >= 2) {
    isMastered = false;
  }

  const { error } = await supabaseServer
    .from("vocab_progress")
    .update({
      due: params.due,
      difficulty: params.difficulty,
      elapsed_days: params.elapsed_days,
      lapses: params.lapses,
      last_incorrect_at: params.lastIncorrectAt,
      last_review: params.last_review,
      needs_reinforcement: params.needsReinforcement,
      reps: params.reps,
      scheduled_days: params.scheduled_days,
      stability: params.stability,
      state: params.state,
      mistake_streak: params.mistakeStreak,
      correct_streak: newCorrectStreak,
      incorrect_streak: newIncorrectStreak,
      is_mastered: isMastered,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) {
    throw error;
  }
}
