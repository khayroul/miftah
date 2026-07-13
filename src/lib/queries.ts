import { unstable_cache } from "next/cache";
import { supabase } from "./supabase";
import type { Surah, Ayah } from "@/types/database";

/**
 * Fetch all 114 surahs ordered by id.
 */
async function fetchSurahs(): Promise<Surah[]> {
  const { data, error } = await supabase
    .from("surahs")
    .select("*")
    .order("id");
  if (error) throw error;
  return data;
}

const getCachedSurahs = unstable_cache(fetchSurahs, ["surahs"], {
  revalidate: 3600,
  tags: ["surahs"],
});

export async function getSurahs(): Promise<Surah[]> {
  return getCachedSurahs();
}

/**
 * Fetch a single surah by id.
 */
async function fetchSurah(id: number): Promise<Surah> {
  const { data, error } = await supabase
    .from("surahs")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

const getCachedSurah = unstable_cache(
  async (id: number) => fetchSurah(id),
  ["surah-by-id"],
  {
    revalidate: 3600,
    tags: ["surah-by-id"],
  },
);

export async function getSurah(id: number): Promise<Surah> {
  return getCachedSurah(id);
}

/**
 * Fetch all ayat for a surah.
 */
export async function getAyatBySurah(surahId: number): Promise<Ayah[]> {
  const { data, error } = await supabase
    .from("ayat")
    .select("*")
    .eq("surah_id", surahId)
    .order("ayah_number");
  if (error) throw error;
  return data;
}

/**
 * Fetch all ayat for a given page number.
 */
export async function getAyatByPage(pageNumber: number): Promise<Ayah[]> {
  const { data, error } = await supabase
    .from("ayat")
    .select("*")
    .eq("page_number", pageNumber)
    .order("surah_id")
    .order("ayah_number");
  if (error) throw error;
  return data;
}

/**
 * Fetch only id/surah_id/ayah_number for all ayat on a page — for callers
 * that key off ayah identity (e.g. re-deriving "surah:ayah" keys) without
 * paying for the full row's wide text_uthmani/text_simple/display_bm/
 * translation columns (~862 B/row full vs. a few bytes for these 3 ints).
 */
export async function getAyatIdentityByPage(
  pageNumber: number,
): Promise<Array<Pick<Ayah, "id" | "surah_id" | "ayah_number">>> {
  const { data, error } = await supabase
    .from("ayat")
    .select("id, surah_id, ayah_number")
    .eq("page_number", pageNumber)
    .order("surah_id")
    .order("ayah_number");
  if (error) throw error;
  return data;
}

/**
 * Fetch all ayat up to (and including) a given page number.
 */
export async function getAyatUpToPage(upToPage: number): Promise<{ id: number }[]> {
  const { data, error } = await supabase
    .from("ayat")
    .select("id")
    .lte("page_number", upToPage)
    .order("id");
  if (error) throw error;
  return data;
}

/**
 * Fetch a single ayah by surah and ayah number.
 */
export async function getAyah(
  surahId: number,
  ayahNumber: number,
): Promise<Ayah> {
  const { data, error } = await supabase
    .from("ayat")
    .select("*")
    .eq("surah_id", surahId)
    .eq("ayah_number", ayahNumber)
    .single();
  if (error) throw error;
  return data;
}

/**
 * Fetch word occurrences for an ayah with word details.
 */
export async function getWordsForAyah(ayahId: number) {
  const { data, error } = await supabase
    .from("word_occurrences")
    .select("*, words(*)")
    .eq("ayah_id", ayahId)
    .order("position");
  if (error) throw error;
  return data;
}

export interface AyahWordByWordEntry {
  ayah_id: number;
  position: number;
  text_uthmani: string;
  translation_bm: string | null;
  translation_en: string | null;
}

interface WordOccurrenceWbwRow {
  ayah_id: number;
  position: number;
  words:
    | {
        text_uthmani: string;
        translation_bm: string | null;
        translation_en: string | null;
      }
    | Array<{
        text_uthmani: string;
        translation_bm: string | null;
        translation_en: string | null;
      }>
    | null;
}

function chunkValues(values: number[], size: number): number[][] {
  const chunks: number[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function normalizeWordOccurrenceWbwRows(rows: WordOccurrenceWbwRow[]): AyahWordByWordEntry[] {
  const result: AyahWordByWordEntry[] = [];

  for (const row of rows) {
    const relation = Array.isArray(row.words) ? row.words[0] : row.words;
    if (!relation) {
      continue;
    }

    result.push({
      ayah_id: row.ayah_id,
      position: row.position,
      text_uthmani: relation.text_uthmani,
      translation_bm: relation.translation_bm,
      translation_en: relation.translation_en,
    });
  }

  return result;
}

function normalizeAyahIds(values: number[]): number[] {
  return Array.from(
    new Set(values.filter((ayahId) => Number.isInteger(ayahId) && ayahId > 0)),
  );
}

/**
 * Fetch WBW tokens for multiple ayat. Result is grouped by ayah_id and
 * ordered by word position within each ayah.
 */
async function fetchWordByWordForAyahIds(
  ayahIds: number[],
): Promise<Record<number, AyahWordByWordEntry[]>> {
  if (ayahIds.length === 0) {
    return {};
  }

  const grouped: Record<number, AyahWordByWordEntry[]> = {};
  const batches = chunkValues(ayahIds, 40);

  const batchResults = await Promise.all(
    batches.map(async (ayahIdBatch) => {
      const { data, error } = await supabase
        .from("word_occurrences")
        .select("ayah_id, position, words(text_uthmani, translation_bm, translation_en)")
        .in("ayah_id", ayahIdBatch)
        .order("ayah_id")
        .order("position");

      if (error) {
        throw error;
      }

      return normalizeWordOccurrenceWbwRows(
        (data ?? []) as WordOccurrenceWbwRow[],
      );
    }),
  );

  for (const normalizedRows of batchResults) {
    for (const entry of normalizedRows) {
      const current = grouped[entry.ayah_id] ?? [];
      current.push(entry);
      grouped[entry.ayah_id] = current;
    }
  }

  for (const ayahId of Object.keys(grouped)) {
    const numericAyahId = Number.parseInt(ayahId, 10);
    const rows = grouped[numericAyahId];
    if (!rows) {
      continue;
    }
    rows.sort((a, b) => a.position - b.position);
  }

  return grouped;
}

const getCachedWordByWordForAyahIds = unstable_cache(
  async (ayahIdsKey: string) => {
    const ayahIds = ayahIdsKey
      .split(",")
      .map((value) => Number.parseInt(value, 10))
      .filter((value) => Number.isInteger(value) && value > 0);
    return fetchWordByWordForAyahIds(ayahIds);
  },
  ["word-by-word-by-ayah-ids"],
  {
    revalidate: 3600,
    tags: ["word-by-word-by-ayah-ids"],
  },
);

export async function getWordByWordForAyahIds(
  ayahIds: number[],
): Promise<Record<number, AyahWordByWordEntry[]>> {
  const normalizedAyahIds = normalizeAyahIds(ayahIds);
  if (normalizedAyahIds.length === 0) {
    return {};
  }

  return getCachedWordByWordForAyahIds(normalizedAyahIds.join(","));
}
