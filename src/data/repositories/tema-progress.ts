import { supabaseServer } from "@/data/supabase/server";
import type {
  ThemeChunkProgress,
  ThemeChunkProgressStatus,
} from "@/shared/types/database";
import { themeChunkContentKeyFromChunks } from "./tema-chunks";
import { getThemeAppearanceChunksBySurah } from "./tema-read";
import type { ThemeChunkContentKey } from "./tema-types";

export async function resolveThemeChunkContentKey(
  surahId: number,
  chunkIndex: number,
): Promise<ThemeChunkContentKey | null> {
  const chunks = await getThemeAppearanceChunksBySurah(surahId);
  return themeChunkContentKeyFromChunks(chunks, chunkIndex);
}

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
  const contentKey = await resolveThemeChunkContentKey(surahId, chunkIndex);
  if (!contentKey) {
    throw new Error(
      `Unknown theme chunk: surah ${surahId}, chunk index ${chunkIndex}`,
    );
  }
  const { startAyah, endAyah } = contentKey;

  const { data: existing, error: existingError } = await supabaseServer
    .from("theme_chunk_progress")
    .select("*")
    .eq("user_id", userId)
    .eq("surah_id", surahId)
    .eq("start_ayah", startAyah)
    .eq("end_ayah", endAyah)
    .maybeSingle();

  if (existingError) throw existingError;

  const now = new Date().toISOString();
  if (!existing) {
    const { data, error } = await supabaseServer
      .from("theme_chunk_progress")
      .insert({
        chunk_index: chunkIndex,
        completed_at: status === "completed" ? now : null,
        end_ayah: endAyah,
        first_opened_at: now,
        last_opened_at: now,
        start_ayah: startAyah,
        status,
        surah_id: surahId,
        user_id: userId,
      })
      .select("*")
      .single();

    if (error) throw error;
    return data as ThemeChunkProgress;
  }

  const nextStatus =
    existing.status === "completed" || status === "completed"
      ? "completed"
      : "started";
  const { data, error } = await supabaseServer
    .from("theme_chunk_progress")
    .update({
      chunk_index: chunkIndex,
      completed_at:
        nextStatus === "completed" ? existing.completed_at ?? now : null,
      last_opened_at: now,
      status: nextStatus,
    })
    .eq("id", existing.id)
    .eq("user_id", userId)
    .select("*")
    .single();

  if (error) throw error;
  return data as ThemeChunkProgress;
}
