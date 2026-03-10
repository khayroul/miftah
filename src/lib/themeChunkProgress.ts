import { supabaseServer } from "@/lib/supabase-server";
import type {
  ThemeChunkProgress,
  ThemeChunkProgressStatus,
} from "@/types/database";

interface MarkThemeChunkProgressParams {
  chunkIndex: number;
  status: ThemeChunkProgressStatus;
  surahId: number;
  userId: string;
}

export async function markThemeChunkProgress({
  chunkIndex,
  status,
  surahId,
  userId,
}: MarkThemeChunkProgressParams): Promise<ThemeChunkProgress> {
  const { data: existing, error: existingError } = await supabaseServer
    .from("theme_chunk_progress")
    .select("*")
    .eq("user_id", userId)
    .eq("surah_id", surahId)
    .eq("chunk_index", chunkIndex)
    .maybeSingle();

  if (existingError) {
    throw existingError;
  }

  const now = new Date().toISOString();

  if (!existing) {
    const { data, error } = await supabaseServer
      .from("theme_chunk_progress")
      .insert({
        chunk_index: chunkIndex,
        completed_at: status === "completed" ? now : null,
        first_opened_at: now,
        last_opened_at: now,
        status,
        surah_id: surahId,
        user_id: userId,
      })
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    return data as ThemeChunkProgress;
  }

  const nextStatus =
    existing.status === "completed" || status === "completed"
      ? "completed"
      : "started";
  const { data, error } = await supabaseServer
    .from("theme_chunk_progress")
    .update({
      completed_at:
        nextStatus === "completed" ? existing.completed_at ?? now : null,
      last_opened_at: now,
      status: nextStatus,
    })
    .eq("id", existing.id)
    .eq("user_id", userId)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data as ThemeChunkProgress;
}
