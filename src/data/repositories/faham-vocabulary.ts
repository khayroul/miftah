import { cache } from "react";
import { supabaseServer } from "@/data/supabase/server";
import {
  normalizeMalayMeaning,
  type FahamMcqPoolWord,
} from "@/features/faham/domain/mcq";
import { TOP_FAHAM_WORD_LIMIT } from "@/features/faham/domain/config";
import type { Word } from "@/types/database";

export interface AyahLite {
  surah_id: number;
  ayah_number: number;
}
export interface WordOccurrenceLite {
  ayah_id: number;
  page_number: number | null;
  position: number;
  ayat: AyahLite | AyahLite[] | null;
}

export interface RepoWordWithOccurrences extends Word {
  word_occurrences: WordOccurrenceLite | WordOccurrenceLite[] | null;
}

export interface FirstOccurrenceWordRow {
  first_occurrence: WordOccurrenceLite | WordOccurrenceLite[] | null;
  id: number;
}

export const FAHAM_WORD_COLUMNS =
  "id, text_uthmani, text_simple, translation_bm, translation_en, transliteration, root, lemma, pos, frequency";
export const FIRST_OCCURRENCE_PARENT_CHUNK_SIZE = 200;
const FIRST_OCCURRENCE_SELECT =
  "id, first_occurrence:word_occurrences(ayah_id, position, page_number, ayat(surah_id, ayah_number))";

export interface FahamTierVocabWord {
  frequency: number;
  id: number;
  textSimple: string;
  textUthmani: string;
  translationBm: string | null;
  translationEn: string | null;
  transliteration: string | null;
}

export function firstRelation<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}

export function uniquePositiveIntegerIds(ids: number[]): number[] {
  return Array.from(
    new Set(ids.filter((id) => Number.isInteger(id) && id > 0)),
  );
}

/** Split parent ids into requests comfortably below row and URL limits. */
export function chunkIds(
  ids: number[],
  chunkSize = FIRST_OCCURRENCE_PARENT_CHUNK_SIZE,
): number[][] {
  if (!Number.isInteger(chunkSize) || chunkSize <= 0) {
    throw new RangeError("chunkSize must be a positive integer");
  }

  const chunks: number[][] = [];
  for (let index = 0; index < ids.length; index += chunkSize) {
    chunks.push(ids.slice(index, index + chunkSize));
  }
  return chunks;
}

/** Extract aliased child rows and restore the caller's parent-id order. */
export function firstOccurrencesFromWordRows(
  requestedWordIds: number[],
  rows: FirstOccurrenceWordRow[],
): Map<number, WordOccurrenceLite> {
  const foundByWordId = new Map<number, WordOccurrenceLite>();

  for (const row of rows) {
    const firstOccurrence = firstRelation(row.first_occurrence);
    if (firstOccurrence && !foundByWordId.has(row.id)) {
      foundByWordId.set(row.id, firstOccurrence);
    }
  }

  const ordered = new Map<number, WordOccurrenceLite>();
  for (const wordId of requestedWordIds) {
    const occurrence = foundByWordId.get(wordId);
    if (occurrence) {
      ordered.set(wordId, occurrence);
    }
  }
  return ordered;
}

type FirstOccurrenceChunkLoader = (
  wordIds: number[],
) => Promise<FirstOccurrenceWordRow[]>;

export async function loadFirstOccurrencesInChunks(
  wordIds: number[],
  loadChunk: FirstOccurrenceChunkLoader,
  chunkSize = FIRST_OCCURRENCE_PARENT_CHUNK_SIZE,
): Promise<Map<number, WordOccurrenceLite>> {
  const uniqueWordIds = uniquePositiveIntegerIds(wordIds);
  if (uniqueWordIds.length === 0) {
    return new Map();
  }

  const rowChunks = await Promise.all(
    chunkIds(uniqueWordIds, chunkSize).map(loadChunk),
  );
  return firstOccurrencesFromWordRows(uniqueWordIds, rowChunks.flat());
}

/**
 * Load one occurrence context per word through bounded parent batches.
 *
 * The root `words` rows stay below PostgREST's row cap, while the aliased
 * embedded relation gets its own order and per-parent limit. Unlike a flat
 * occurrence query, a high-frequency word can never consume the response cap
 * before later requested words are represented.
 */
export async function firstOccurrenceFor(
  wordIds: number[],
): Promise<Map<number, WordOccurrenceLite>> {
  return loadFirstOccurrencesInChunks(wordIds, async (wordIdChunk) => {
    const { data, error } = await supabaseServer
      .from("words")
      .select(FIRST_OCCURRENCE_SELECT)
      .in("id", wordIdChunk)
      .order("ayah_id", {
        ascending: true,
        referencedTable: "first_occurrence",
      })
      .order("position", {
        ascending: true,
        referencedTable: "first_occurrence",
      })
      .limit(1, { referencedTable: "first_occurrence" });
    if (error) {
      throw error;
    }

    return (data ?? []) as FirstOccurrenceWordRow[];
  });
}

export function attachFirstOccurrences(
  words: Word[],
  occurrences: Map<number, WordOccurrenceLite>,
): RepoWordWithOccurrences[] {
  return words.map((word) => ({
    ...word,
    word_occurrences: occurrences.get(word.id) ?? null,
  }));
}

export const getTopFahamWordIds = cache(async (wordLimit = TOP_FAHAM_WORD_LIMIT): Promise<number[]> => {
  const { data, error } = await supabaseServer
    .from("words")
    .select("id")
    .order("frequency", { ascending: false })
    .limit(wordLimit);
  if (error) {
    throw error;
  }

  return ((data ?? []) as Array<{ id: number }>).map((row) => row.id);
});

export const getTopFahamWordCount = cache(async (wordLimit = TOP_FAHAM_WORD_LIMIT): Promise<number> => {
  const wordIds = await getTopFahamWordIds(wordLimit);
  return wordIds.length;
});

export async function getFahamMcqWordPool(
  limit: number,
  wordLimit = TOP_FAHAM_WORD_LIMIT,
) {
  const topWordIds = await getTopFahamWordIds(wordLimit);
  if (topWordIds.length === 0) {
    return [];
  }

  const { data, error } = await supabaseServer
    .from("words")
    .select(FAHAM_WORD_COLUMNS)
    .in("id", topWordIds)
    .not("translation_bm", "is", null)
    .order("frequency", { ascending: false })
    .limit(limit);
  if (error) {
    throw error;
  }

  const wordRows = (data ?? []) as Word[];
  const firstOccurrences = await firstOccurrenceFor(
    wordRows.map((word) => word.id),
  );
  const seen = new Set<string>();
  const pool: FahamMcqPoolWord[] = [];

  for (const row of attachFirstOccurrences(wordRows, firstOccurrences)) {
    const normalizedMeaning = normalizeMalayMeaning(row.translation_bm);
    const normalizedArabic = row.text_uthmani ? row.text_uthmani.trim() : "";
    if (
      !normalizedMeaning ||
      normalizedArabic.length === 0 ||
      seen.has(`${normalizedMeaning}::${normalizedArabic}`)
    ) {
      continue;
    }

    const firstOcc = firstRelation(row.word_occurrences);
    const ayah = firstOcc ? firstRelation(firstOcc.ayat) : null;
    const audioKey = (firstOcc && ayah)
      ? `${ayah.surah_id}:${ayah.ayah_number}:${firstOcc.position}`
      : null;

    seen.add(`${normalizedMeaning}::${normalizedArabic}`);
    pool.push({
      audioKey,
      frequency: row.frequency,
      id: row.id,
      lemma: row.lemma,
      pos: row.pos,
      root: row.root,
      textSimple: row.text_simple,
      textUthmani: normalizedArabic,
      translationBm: normalizedMeaning,
      transliteration: row.transliteration,
    });
  }

  return pool;
}

export async function getFahamTierVocabWords(
  wordLimit: number,
): Promise<FahamTierVocabWord[]> {
  const topWordIds = await getTopFahamWordIds(wordLimit);
  if (topWordIds.length === 0) {
    return [];
  }

  const { data, error } = await supabaseServer
    .from("words")
    .select(
      "id, text_uthmani, text_simple, translation_bm, translation_en, transliteration, frequency",
    )
    .in("id", topWordIds)
    .order("frequency", { ascending: false })
    .limit(topWordIds.length);
  if (error) {
    throw error;
  }

  const words: FahamTierVocabWord[] = [];
  for (const row of (data ?? []) as Array<{
    id: number;
    text_uthmani: string;
    text_simple: string;
    translation_bm: string | null;
    translation_en: string | null;
    transliteration: string | null;
    frequency: number;
  }>) {
    const textUthmani = row.text_uthmani.trim();
    if (!textUthmani) {
      continue;
    }

    words.push({
      frequency: row.frequency,
      id: row.id,
      textSimple: row.text_simple,
      textUthmani,
      translationBm: normalizeMalayMeaning(row.translation_bm),
      translationEn: row.translation_en,
      transliteration: row.transliteration,
    });
  }

  return words;
}
