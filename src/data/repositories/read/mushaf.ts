import { unstable_cache } from "next/cache";
import { supabaseBrowser } from "@/data/supabase/browser";
import type { Surah, Ayah } from "@/shared/types/database";

const supabase = supabaseBrowser;
const SURAH_COLUMNS =
  "id,name_arabic,name_transliteration,name_bm,name_en,revelation_type,ayah_count,juz_start,page_start,page_end,order_revealed";
const AYAH_COLUMNS =
  "id,surah_id,ayah_number,text_uthmani,text_simple,translation_id,translation_en,display_bm,bm_flagged,bm_resolution_notes,bm_correction_note,page_number,juz_number,hizb_number,ruku_number,sajdah,word_count,audio_url";

export type AyahIdentity = Pick<Ayah, "id" | "surah_id" | "ayah_number">;

function toSurah(row: Surah): Surah {
  return { ...row };
}

function toAyah(row: Ayah): Ayah {
  return { ...row };
}

/**
 * Fetch all 114 surahs ordered by id.
 */
async function fetchSurahs(): Promise<Surah[]> {
  const { data, error } = await supabase
    .from("surahs")
    .select(SURAH_COLUMNS)
    .order("id");
  if (error) throw error;
  return data.map(toSurah);
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
    .select(SURAH_COLUMNS)
    .eq("id", id)
    .single();
  if (error) throw error;
  return toSurah(data);
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
async function fetchAyatBySurah(surahId: number): Promise<Ayah[]> {
  const { data, error } = await supabase
    .from("ayat")
    .select(AYAH_COLUMNS)
    .eq("surah_id", surahId)
    .order("ayah_number");
  if (error) throw error;
  return data.map(toAyah);
}

const getCachedAyatBySurah = unstable_cache(
  fetchAyatBySurah,
  ["ayat-by-surah"],
  { revalidate: 3600, tags: ["quran-ayat"] },
);

export async function getAyatBySurah(surahId: number): Promise<Ayah[]> {
  return getCachedAyatBySurah(surahId);
}

/**
 * Fetch all ayat for a given page number.
 */
async function fetchAyatByPage(pageNumber: number): Promise<Ayah[]> {
  const { data, error } = await supabase
    .from("ayat")
    .select(AYAH_COLUMNS)
    .eq("page_number", pageNumber)
    .order("surah_id")
    .order("ayah_number");
  if (error) throw error;
  return data.map(toAyah);
}

const getCachedAyatByPage = unstable_cache(fetchAyatByPage, ["ayat-by-page"], {
  revalidate: 3600,
  tags: ["quran-ayat"],
});

export async function getAyatByPage(pageNumber: number): Promise<Ayah[]> {
  return getCachedAyatByPage(pageNumber);
}

/**
 * Fetch only id/surah_id/ayah_number for all ayat on a page — for callers
 * that key off ayah identity (e.g. re-deriving "surah:ayah" keys) without
 * paying for the full row's wide text_uthmani/text_simple/display_bm/
 * translation columns (~862 B/row full vs. a few bytes for these 3 ints).
 */
async function fetchAyatIdentityByPage(
  pageNumber: number,
): Promise<AyahIdentity[]> {
  const { data, error } = await supabase
    .from("ayat")
    .select("id, surah_id, ayah_number")
    .eq("page_number", pageNumber)
    .order("surah_id")
    .order("ayah_number");
  if (error) throw error;
  return data.map((row) => ({
    id: row.id,
    surah_id: row.surah_id,
    ayah_number: row.ayah_number,
  }));
}

const getCachedAyatIdentityByPage = unstable_cache(
  fetchAyatIdentityByPage,
  ["ayat-identity-by-page"],
  { revalidate: 3600, tags: ["quran-ayat"] },
);

export async function getAyatIdentityByPage(
  pageNumber: number,
): Promise<AyahIdentity[]> {
  return getCachedAyatIdentityByPage(pageNumber);
}

/**
 * Fetch all ayat up to (and including) a given page number.
 */
async function fetchAyatUpToPage(upToPage: number): Promise<{ id: number }[]> {
  const { data, error } = await supabase
    .from("ayat")
    .select("id")
    .lte("page_number", upToPage)
    .order("id");
  if (error) throw error;
  return data.map((row) => ({ id: row.id }));
}

const getCachedAyatUpToPage = unstable_cache(
  fetchAyatUpToPage,
  ["ayat-up-to-page"],
  { revalidate: 3600, tags: ["quran-ayat"] },
);

export async function getAyatUpToPage(
  upToPage: number,
): Promise<{ id: number }[]> {
  return getCachedAyatUpToPage(upToPage);
}

/**
 * Fetch a single ayah by surah and ayah number.
 */
async function fetchAyah(
  surahId: number,
  ayahNumber: number,
): Promise<Ayah> {
  const { data, error } = await supabase
    .from("ayat")
    .select(AYAH_COLUMNS)
    .eq("surah_id", surahId)
    .eq("ayah_number", ayahNumber)
    .single();
  if (error) throw error;
  return toAyah(data);
}

const getCachedAyah = unstable_cache(fetchAyah, ["ayah-by-key"], {
  revalidate: 3600,
  tags: ["quran-ayat"],
});

export async function getAyah(
  surahId: number,
  ayahNumber: number,
): Promise<Ayah> {
  return getCachedAyah(surahId, ayahNumber);
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
