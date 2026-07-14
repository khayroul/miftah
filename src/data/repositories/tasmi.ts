import { supabaseServer } from "@/data/supabase/server";

export interface JuzukExamAyah {
  id: number;
  surahId: number;
  ayahNumber: number;
  textSimple: string;
}

export interface JuzukExamRound {
  juz: number;
  pageNumber: number;
  /** The randomly selected test ayah (first element of `ayahs`) */
  testAyah: JuzukExamAyah;
  /** Test ayah through the end of its mushaf page, in recitation order */
  ayahs: JuzukExamAyah[];
}

/**
 * Mode B (juzuk exam): pick a random test ayah within a juz and return the
 * recitation span from that ayah to the end of its mushaf page.
 *
 * `excludeAyahIds` lets the caller avoid repeating recent test ayat within a
 * sitting; when exclusion empties the pool, the full pool is used again.
 */
export async function getJuzukExamRound(
  juz: number,
  excludeAyahIds: number[] = [],
): Promise<JuzukExamRound | null> {
  const { data: candidates, error: candidatesError } = await supabaseServer
    .from("ayat")
    .select("id, surah_id, ayah_number, page_number")
    .eq("juz_number", juz)
    .order("id");
  if (candidatesError) throw candidatesError;
  if (!candidates || candidates.length === 0) return null;

  const excluded = new Set(excludeAyahIds);
  const pool = candidates.filter(c => !excluded.has(c.id));
  const effectivePool = pool.length > 0 ? pool : candidates;
  const test = effectivePool[Math.floor(Math.random() * effectivePool.length)];
  if (test.page_number === null) return null;

  // The span: every ayah on the test ayah's page from the test ayah onward.
  // `id` is the canonical recitation order (surah asc, ayah asc).
  const { data: span, error: spanError } = await supabaseServer
    .from("ayat")
    .select("id, surah_id, ayah_number, text_simple")
    .eq("page_number", test.page_number)
    .gte("id", test.id)
    .order("id");
  if (spanError) throw spanError;
  if (!span || span.length === 0) return null;

  const ayahs: JuzukExamAyah[] = span.map(row => ({
    id: row.id,
    surahId: row.surah_id,
    ayahNumber: row.ayah_number,
    textSimple: row.text_simple,
  }));

  return {
    juz,
    pageNumber: test.page_number,
    testAyah: ayahs[0],
    ayahs,
  };
}

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
): Promise<boolean> {
  const { error } = await supabaseServer
    .from("tasmi_sessions")
    .insert({ ...input, user_id: userId });

  return !error;
}
