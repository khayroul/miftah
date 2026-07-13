import { supabaseServer } from "@/data/supabase/server";
import { matureCardDbRow } from "@/shared/fsrsBridge";

export interface HifzTasmiAyah {
  id: number;
  ayahNumber: number;
  surahId: number;
  textSimple: string;
}

export async function getHifzTasmiAyahs(
  ayahIds: number[],
): Promise<HifzTasmiAyah[]> {
  if (ayahIds.length === 0) return [];

  const { data, error } = await supabaseServer
    .from("ayat")
    .select("id, surah_id, ayah_number, text_simple")
    .in("id", ayahIds)
    .order("surah_id")
    .order("ayah_number");
  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    ayahNumber: row.ayah_number,
    surahId: row.surah_id,
    textSimple: row.text_simple,
  }));
}

export async function importMemorizedProgress(params: {
  ayahIds: number[];
  userId: string;
}): Promise<number> {
  const { ayahIds, userId } = params;
  if (ayahIds.length === 0) return 0;

  const { data: existing, error: readError } = await supabaseServer
    .from("study_progress")
    .select("ayah_id, hifz_status")
    .eq("user_id", userId)
    .in("ayah_id", ayahIds);
  if (readError) throw readError;

  const alreadyManzil = new Set(
    (existing ?? [])
      .filter((row) => row.hifz_status === "manzil")
      .map((row) => row.ayah_id),
  );
  const existingIds = new Set((existing ?? []).map((row) => row.ayah_id));
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const fsrs = matureCardDbRow();
  const toInsert = ayahIds
    .filter((ayahId) => !alreadyManzil.has(ayahId) && !existingIds.has(ayahId))
    .map((ayahId) => ({
      user_id: userId,
      ayah_id: ayahId,
      hifz_status: "manzil" as const,
      sabak_started_at: thirtyDaysAgo.toISOString(),
      moved_to_sabqi_at: thirtyDaysAgo.toISOString(),
      moved_to_manzil_at: now.toISOString(),
      ...fsrs,
    }));
  const toUpdate = ayahIds.filter(
    (ayahId) => !alreadyManzil.has(ayahId) && existingIds.has(ayahId),
  );

  for (let index = 0; index < toInsert.length; index += 500) {
    const { error } = await supabaseServer
      .from("study_progress")
      .insert(toInsert.slice(index, index + 500));
    if (error) throw error;
  }

  for (let index = 0; index < toUpdate.length; index += 500) {
    const { error } = await supabaseServer
      .from("study_progress")
      .update({
        hifz_status: "manzil",
        moved_to_sabqi_at: thirtyDaysAgo.toISOString(),
        moved_to_manzil_at: now.toISOString(),
        ...fsrs,
        updated_at: now.toISOString(),
      })
      .eq("user_id", userId)
      .in("ayah_id", toUpdate.slice(index, index + 500));
    if (error) throw error;
  }

  return toInsert.length + toUpdate.length;
}
