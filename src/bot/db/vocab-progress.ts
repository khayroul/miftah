import { supabaseAdmin } from "../supabase-admin.js";
import { newCardDbRow } from "../services/fsrs-bridge.js";
import type { FsrsFields, VocabProgress } from "@/shared/types/database";

export async function getOrCreateVocabProgress(
  userId: string,
  wordId: number,
): Promise<VocabProgress> {
  const { data } = await supabaseAdmin
    .from("vocab_progress")
    .select("*")
    .eq("user_id", userId)
    .eq("word_id", wordId)
    .single();

  if (data) return data as VocabProgress;

  const row = { user_id: userId, word_id: wordId, ...newCardDbRow() };
  const { data: created, error } = await supabaseAdmin
    .from("vocab_progress")
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  return created as VocabProgress;
}

export async function updateVocabFsrs(
  id: number,
  fields: FsrsFields,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("vocab_progress")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function getDueVocab(
  userId: string,
  limit: number,
): Promise<VocabProgress[]> {
  const { data, error } = await supabaseAdmin
    .from("vocab_progress")
    .select("*")
    .eq("user_id", userId)
    .lte("due", new Date().toISOString())
    .order("due", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as VocabProgress[];
}

export async function getVocabStateCounts(
  userId: string,
): Promise<Record<number, number>> {
  const { data, error } = await supabaseAdmin
    .from("vocab_progress")
    .select("state")
    .eq("user_id", userId);
  if (error) throw error;

  const counts: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
  for (const row of data ?? []) {
    counts[row.state] = (counts[row.state] ?? 0) + 1;
  }
  return counts;
}
