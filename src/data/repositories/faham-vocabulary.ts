import { cache } from "react";
import { supabaseServer } from "@/data/supabase/server";
import {
  normalizeMalayMeaning,
  type FahamMcqPoolWord,
} from "@/lib/faham/mcq";
import { TOP_FAHAM_WORD_LIMIT } from "@/lib/faham/config";
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
    .select(
      "id, text_uthmani, text_simple, translation_bm, transliteration, root, lemma, pos, frequency, word_occurrences(ayah_id, position, page_number, ayat(surah_id, ayah_number))",
    )
    .in("id", topWordIds)
    .not("translation_bm", "is", null)
    .order("frequency", { ascending: false })
    .limit(limit);
  if (error) {
    throw error;
  }

  const seen = new Set<string>();
  const pool: FahamMcqPoolWord[] = [];

  for (const row of (data ?? []) as RepoWordWithOccurrences[]) {
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
