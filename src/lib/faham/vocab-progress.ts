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
