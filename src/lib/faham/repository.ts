import { supabaseServer } from "@/lib/supabase-server";
import { normalizeMalayMeaning } from "./mcq";
import type {
  VocabExposureSummary,
  VocabProgress,
  Word,
} from "@/types/database";
import { getOrCreateVocabProgress } from "./vocab-progress";
import { buildFahamSourceKey } from "./source-key";
import type {
  FahamCandidateWord,
  FahamDueCard,
  FahamExposureInput,
} from "./types";

interface VocabProgressWordJoinRow extends VocabProgress {
  words: Word | Word[] | null;
}

interface WordOccurrenceJoinRow {
  ayah_id: number;
  position: number;
  word_id: number;
  words: Word | Word[] | null;
}

function firstRelation<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}

async function getUniqueWordOccurrencesForAyahIds(
  ayahIds: number[],
): Promise<
  Array<{
    occurrenceCount: number;
    word: Word;
  }>
> {
  const uniqueAyahIds = Array.from(
    new Set(ayahIds.filter((ayahId) => Number.isInteger(ayahId) && ayahId > 0)),
  );
  if (uniqueAyahIds.length === 0) {
    return [];
  }

  const { data, error } = await supabaseServer
    .from("word_occurrences")
    .select(
      "ayah_id, position, word_id, words!inner(id, text_uthmani, text_simple, translation_bm, translation_en, transliteration, root, lemma, pos, frequency)",
    )
    .in("ayah_id", uniqueAyahIds)
    .order("ayah_id", { ascending: true })
    .order("position", { ascending: true });
  if (error) {
    throw error;
  }

  const counts = new Map<number, { occurrenceCount: number; word: Word }>();

  for (const row of (data ?? []) as WordOccurrenceJoinRow[]) {
    const word = firstRelation(row.words);
    if (!word) {
      continue;
    }

    const current = counts.get(row.word_id);
    if (current) {
      counts.set(row.word_id, {
        occurrenceCount: current.occurrenceCount + 1,
        word: current.word,
      });
      continue;
    }

    counts.set(row.word_id, {
      occurrenceCount: 1,
      word,
    });
  }

  return Array.from(counts.values());
}

export async function recordVocabExposureEvents(
  userId: string,
  input: FahamExposureInput,
): Promise<{ recordedWordCount: number; sourceKey: string }> {
  const words = await getUniqueWordOccurrencesForAyahIds(input.ayahIds);
  if (words.length === 0) {
    return {
      recordedWordCount: 0,
      sourceKey: buildFahamSourceKey(input),
    };
  }

  const sourceKey = buildFahamSourceKey(input);
  const exposedAt = new Date().toISOString();
  const ayahId =
    input.sourceType === "hifz_ayah" && input.ayahIds.length === 1
      ? input.ayahIds[0]
      : null;

  const rows = words.map(({ occurrenceCount, word }) => ({
    user_id: userId,
    word_id: word.id,
    source_type: input.sourceType,
    source_key: sourceKey,
    ayah_id: ayahId,
    page_number: input.sourceType === "reading_page" ? input.pageNumber : null,
    surah_id:
      input.sourceType === "reading_page" || input.sourceType === "theme_chunk"
        ? input.surahId ?? null
        : input.surahId ?? null,
    theme_chunk_index:
      input.sourceType === "theme_chunk" ? input.themeChunkIndex : null,
    occurrence_count: occurrenceCount,
    exposed_at: exposedAt,
  }));

  const { error } = await supabaseServer
    .from("vocab_exposure_events")
    .insert(rows);
  if (error) {
    throw error;
  }

  return {
    recordedWordCount: rows.length,
    sourceKey,
  };
}

export async function getDueFahamCards(
  userId: string,
  limit: number,
): Promise<FahamDueCard[]> {
  const { data, error } = await supabaseServer
    .from("vocab_progress")
    .select(
      "id, user_id, word_id, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, state, due, last_review, created_at, updated_at, words!inner(id, text_uthmani, text_simple, translation_bm, translation_en, transliteration, root, lemma, pos, frequency)",
    )
    .eq("user_id", userId)
    .lte("due", new Date().toISOString())
    .order("due", { ascending: true })
    .limit(limit);
  if (error) {
    throw error;
  }

  return ((data ?? []) as VocabProgressWordJoinRow[])
    .map((row) => {
      const word = firstRelation(row.words);
      if (!word) {
        return null;
      }

      return {
        progress: {
          id: row.id,
          user_id: row.user_id,
          word_id: row.word_id,
          stability: row.stability,
          difficulty: row.difficulty,
          elapsed_days: row.elapsed_days,
          scheduled_days: row.scheduled_days,
          reps: row.reps,
          lapses: row.lapses,
          state: row.state,
          due: row.due,
          last_review: row.last_review,
          created_at: row.created_at,
          updated_at: row.updated_at,
        },
        word,
      };
    })
    .filter((row): row is FahamDueCard => row !== null);
}

export async function getFahamExposureCandidates(
  userId: string,
  limit: number,
): Promise<FahamCandidateWord[]> {
  const { data, error } = await supabaseServer
    .from("v_vocab_exposure_summary")
    .select("*")
    .eq("user_id", userId)
    .order("last_exposed_at", { ascending: false })
    .limit(limit);
  if (error) {
    throw error;
  }

  const summaries = (data ?? []) as VocabExposureSummary[];
  if (summaries.length === 0) {
    return [];
  }

  const wordIds = summaries.map((summary) => summary.word_id);
  const [{ data: wordData, error: wordError }, { data: knownProgress, error: progressError }] =
    await Promise.all([
      supabaseServer
        .from("words")
        .select(
          "id, text_uthmani, text_simple, translation_bm, translation_en, transliteration, root, lemma, pos, frequency",
        )
        .in("id", wordIds),
      supabaseServer
        .from("vocab_progress")
        .select("word_id")
        .eq("user_id", userId)
        .in("word_id", wordIds),
    ]);

  if (wordError) {
    throw wordError;
  }
  if (progressError) {
    throw progressError;
  }

  const wordsById = new Map<number, Word>();
  for (const word of (wordData ?? []) as Word[]) {
    wordsById.set(word.id, word);
  }

  const knownWordIds = new Set(
    ((knownProgress ?? []) as Array<{ word_id: number }>).map((row) => row.word_id),
  );

  return summaries
    .filter((summary) => !knownWordIds.has(summary.word_id))
    .map((summary) => {
      const word = wordsById.get(summary.word_id);
      if (!word) {
        return null;
      }
      if (!word.translation_bm && !word.translation_en) {
        return null;
      }

      return { summary, word };
    })
    .filter((row): row is FahamCandidateWord => row !== null);
}

export async function materializeNewFahamCards(
  userId: string,
  candidates: FahamCandidateWord[],
): Promise<FahamDueCard[]> {
  const cards = await Promise.all(
    candidates.map(async (candidate) => ({
      progress: await getOrCreateVocabProgress(userId, candidate.word.id),
      word: candidate.word,
    })),
  );

  return cards;
}

export async function getFahamMcqWordPool(limit: number) {
  const { data, error } = await supabaseServer
    .from("words")
    .select(
      "id, text_uthmani, text_simple, translation_bm, transliteration, pos, frequency",
    )
    .not("translation_bm", "is", null)
    .order("frequency", { ascending: false })
    .limit(limit);
  if (error) {
    throw error;
  }

  const seen = new Set<string>();
  const pool: Array<{
    frequency: number;
    id: number;
    pos: string | null;
    textSimple: string;
    textUthmani: string;
    translationBm: string | null;
    transliteration: string | null;
  }> = [];

  for (const row of (data ?? []) as Array<{
    frequency: number;
    id: number;
    pos: string | null;
    text_simple: string;
    text_uthmani: string;
    translation_bm: string | null;
    transliteration: string | null;
  }>) {
    const normalizedMeaning = normalizeMalayMeaning(row.translation_bm);
    const normalizedArabic = row.text_uthmani.trim();
    if (
      !normalizedMeaning ||
      normalizedArabic.length === 0 ||
      seen.has(`${normalizedMeaning}::${normalizedArabic}`)
    ) {
      continue;
    }

    seen.add(`${normalizedMeaning}::${normalizedArabic}`);
    pool.push({
      frequency: row.frequency,
      id: row.id,
      pos: row.pos,
      textSimple: row.text_simple,
      textUthmani: normalizedArabic,
      translationBm: normalizedMeaning,
      transliteration: row.transliteration,
    });
  }

  return pool;
}
