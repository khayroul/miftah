import { supabaseServer } from "@/lib/supabase-server";
import { resolveThemeChunkContentKey } from "@/lib/queries";
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
  // RF-5: the client sends a volatile positional chunkIndex, but progress is
  // persisted under the STABLE content key (surah_id, start_ayah, end_ayah) so a
  // future edit to chunk definitions can never silently re-attribute a user's
  // progress to a different ayah range. Resolve the index to its content span
  // via the real chunk builder before touching the table.
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
      // Refresh the display hint to the latest positional index; it is not part
      // of the row's identity (that is the stable content key above).
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

  if (error) {
    throw error;
  }

  return data as ThemeChunkProgress;
}
