import { supabaseServer } from "@/data/supabase/server";

export interface ValidatedTasmiSessionInput {
  surah_number: number;
  start_ayah: number;
  end_ayah: number;
  total_words: number;
  words_correct: number;
  accuracy: number;
  talqin_count: number;
  error_positions: number[];
  duration_seconds: number;
}

export async function saveTasmiSession(
  userId: string,
  input: ValidatedTasmiSessionInput,
): Promise<void> {
  const { error } = await supabaseServer
    .from("tasmi_sessions")
    .insert({ user_id: userId, ...input });

  if (error) {
    throw error;
  }
}
