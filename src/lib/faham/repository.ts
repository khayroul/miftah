import { cache } from "react";
import { supabaseServer } from "@/lib/supabase-server";
import { normalizeMalayMeaning, FahamMcqPoolWord } from "./mcq";
import { TOP_FAHAM_WORD_LIMIT } from "./config";
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
  WordWithOccurrences,
} from "./types";

interface AyahLite {
  surah_id: number;
  ayah_number: number;
}

interface WordOccurrenceLite {
  ayah_id: number;
  position: number;
  ayat: AyahLite | AyahLite[] | null;
}

interface RepoWordWithOccurrences extends Word {
  word_occurrences: WordOccurrenceLite | WordOccurrenceLite[] | null;
}

interface VocabProgressWordJoinRow extends VocabProgress {
  words: RepoWordWithOccurrences | RepoWordWithOccurrences[] | null;
}

interface WordOccurrenceJoinRow {
  ayah_id: number;
  position: number;
  word_id: number;
  words: RepoWordWithOccurrences | RepoWordWithOccurrences[] | null;
}

function firstRelation<T>(value: T | T[] | null): T | null {
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
  wordLimit = TOP_FAHAM_WORD_LIMIT,
): Promise<FahamDueCard[]> {
  const topWordIds = await getTopFahamWordIds(wordLimit);
  if (topWordIds.length === 0) {
    return [];
  }

  const { data, error } = await supabaseServer
    .from("vocab_progress")
    .select(
      "id, user_id, word_id, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, state, due, last_review, needs_reinforcement, mistake_streak, is_mastered, correct_streak, incorrect_streak, last_incorrect_at, created_at, updated_at, words!inner(id, text_uthmani, text_simple, translation_bm, translation_en, transliteration, root, lemma, pos, frequency, word_occurrences(ayah_id, position, ayat(surah_id, ayah_number)))",
    )
    .eq("user_id", userId)
    .in("word_id", topWordIds)
    .lte("due", new Date().toISOString())
    .eq("is_mastered", false)
    .order("needs_reinforcement", { ascending: false })
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
          needs_reinforcement: row.needs_reinforcement,
          mistake_streak: row.mistake_streak,
          is_mastered: row.is_mastered,
          correct_streak: row.correct_streak,
          incorrect_streak: row.incorrect_streak,
          last_incorrect_at: row.last_incorrect_at,
          created_at: row.created_at,
          updated_at: row.updated_at,
        },
        word: word as WordWithOccurrences,
      };
    })
    .filter((row): row is FahamDueCard => row !== null);
}

export async function getFahamExposureCandidates(
  userId: string,
  limit: number,
  wordLimit = TOP_FAHAM_WORD_LIMIT,
): Promise<FahamCandidateWord[]> {
  const topWordIds = await getTopFahamWordIds(wordLimit);
  if (topWordIds.length === 0) {
    return [];
  }

  const { data, error } = await supabaseServer
    .from("v_vocab_exposure_summary")
    .select("*")
    .eq("user_id", userId)
    .in("word_id", topWordIds)
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
          "id, text_uthmani, text_simple, translation_bm, translation_en, transliteration, root, lemma, pos, frequency, word_occurrences(ayah_id, position, ayat(surah_id, ayah_number))",
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

  const wordsById = new Map<number, RepoWordWithOccurrences>();
  for (const word of (wordData ?? []) as RepoWordWithOccurrences[]) {
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

      return { summary, word: word as WordWithOccurrences };
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

export async function getBootstrapFahamCards(
  userId: string,
  limit: number,
  wordLimit = TOP_FAHAM_WORD_LIMIT,
): Promise<FahamDueCard[]> {
  const topWordIds = await getTopFahamWordIds(wordLimit);
  if (topWordIds.length === 0 || limit <= 0) {
    return [];
  }

  const fetchLimit = Math.max(limit * 4, limit);
  const [{ data: wordData, error: wordError }, { data: knownProgress, error: progressError }] =
    await Promise.all([
      supabaseServer
        .from("words")
        .select(
          "id, text_uthmani, text_simple, translation_bm, translation_en, transliteration, root, lemma, pos, frequency, word_occurrences(ayah_id, position, ayat(surah_id, ayah_number))",
        )
        .in("id", topWordIds)
        .not("translation_bm", "is", null)
        .order("frequency", { ascending: false })
        .limit(fetchLimit),
      supabaseServer
        .from("vocab_progress")
        .select("word_id")
        .eq("user_id", userId)
        .in("word_id", topWordIds),
    ]);
  if (wordError) {
    throw wordError;
  }
  if (progressError) {
    throw progressError;
  }

  const knownWordIds = new Set(
    ((knownProgress ?? []) as Array<{ word_id: number }>).map((row) => row.word_id),
  );

  const words = ((wordData ?? []) as RepoWordWithOccurrences[])
    .filter((word) => !knownWordIds.has(word.id))
    .slice(0, limit);

  return Promise.all(
    words.map(async (word) => ({
      progress: await getOrCreateVocabProgress(userId, word.id),
      word: word as WordWithOccurrences,
    })),
  );
}

export async function getMasteredFahamCards(
  userId: string,
  limit: number,
  wordLimit = TOP_FAHAM_WORD_LIMIT,
): Promise<FahamDueCard[]> {
  const topWordIds = await getTopFahamWordIds(wordLimit);
  if (topWordIds.length === 0) {
    return [];
  }

  const { data, error } = await supabaseServer
    .from("vocab_progress")
    .select(
      "id, user_id, word_id, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, state, due, last_review, needs_reinforcement, mistake_streak, is_mastered, correct_streak, incorrect_streak, last_incorrect_at, created_at, updated_at, words!inner(id, text_uthmani, text_simple, translation_bm, translation_en, transliteration, root, lemma, pos, frequency, word_occurrences(ayah_id, position, ayat(surah_id, ayah_number)))",
    )
    .eq("user_id", userId)
    .in("word_id", topWordIds)
    .eq("is_mastered", true)
    .order("last_review", { ascending: true }) // Review least recently reviewed mastered cards
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
          needs_reinforcement: row.needs_reinforcement,
          mistake_streak: row.mistake_streak,
          is_mastered: row.is_mastered,
          correct_streak: row.correct_streak,
          incorrect_streak: row.incorrect_streak,
          last_incorrect_at: row.last_incorrect_at,
          created_at: row.created_at,
          updated_at: row.updated_at,
        },
        word: word as WordWithOccurrences,
      };
    })
    .filter((row): row is FahamDueCard => row !== null);
}

export async function getLearningFahamCards(
  userId: string,
  limit: number,
  wordLimit = TOP_FAHAM_WORD_LIMIT,
): Promise<FahamDueCard[]> {
  const topWordIds = await getTopFahamWordIds(wordLimit);
  if (topWordIds.length === 0) {
    return [];
  }

  const { data, error } = await supabaseServer
    .from("vocab_progress")
    .select(
      "id, user_id, word_id, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, state, due, last_review, needs_reinforcement, mistake_streak, is_mastered, correct_streak, incorrect_streak, last_incorrect_at, created_at, updated_at, words!inner(id, text_uthmani, text_simple, translation_bm, translation_en, transliteration, root, lemma, pos, frequency, word_occurrences(ayah_id, position, ayat(surah_id, ayah_number)))",
    )
    .eq("user_id", userId)
    .in("word_id", topWordIds)
    .gt("due", new Date().toISOString())
    .eq("is_mastered", false)
    .gt("reps", 0)
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
          needs_reinforcement: row.needs_reinforcement,
          mistake_streak: row.mistake_streak,
          is_mastered: row.is_mastered,
          correct_streak: row.correct_streak,
          incorrect_streak: row.incorrect_streak,
          last_incorrect_at: row.last_incorrect_at,
          created_at: row.created_at,
          updated_at: row.updated_at,
        },
        word: word as WordWithOccurrences,
      };
    })
    .filter((row): row is FahamDueCard => row !== null);
}

export async function getFahamStats(
  userId: string,
  wordLimit = TOP_FAHAM_WORD_LIMIT,
) {
  const topWordIds = await getTopFahamWordIds(wordLimit);
  if (topWordIds.length === 0) {
    return {
      wordBank: 0,
      mastered: 0,
      learning: 0,
      dueToday: 0,
      retentionRate7d: 0,
    };
  }
  const [
    { count: encounteredCount },
    { data: progressStats, error: progressError },
    { data: retentionData, error: retentionError },
  ] = await Promise.all([
    supabaseServer
      .from("v_vocab_exposure_summary")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .in("word_id", topWordIds),
    supabaseServer
      .from("vocab_progress")
      .select("word_id, is_mastered, reps, due")
      .eq("user_id", userId)
      .in("word_id", topWordIds),
    supabaseServer
      .from("review_log")
      .select("rating")
      .eq("user_id", userId)
      .eq("review_type", "vocab")
      .gte("reviewed_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
  ]);

  if (progressError) throw progressError;
  if (retentionError) throw retentionError;

  const now = new Date().toISOString();
  let masteredCount = 0;
  let learningCount = 0;
  let dueTodayCount = 0;

  for (const row of (progressStats ?? []) as Array<{ is_mastered: boolean; reps: number; due: string }>) {
    if (row.is_mastered) {
      masteredCount++;
    } else {
      if (row.reps > 0) {
        learningCount++;
      }
      if (row.due <= now) {
        dueTodayCount++;
      }
    }
    // New (reps == 0) cards that were already assigned progress but not yet mastered are learning? 
    // Usually reps=0 means "New".
  }

  const ratings = Array.isArray(retentionData) ? retentionData : [];
  const successCount = ratings.filter((r) => r && typeof r.rating === 'number' && r.rating > 1).length;
  const totalCount = ratings.length;
  const retentionRate = totalCount > 0 ? successCount / totalCount : 0;

  return {
    wordBank: encounteredCount ?? 0,
    mastered: masteredCount,
    learning: learningCount,
    dueToday: dueTodayCount,
    retentionRate7d: retentionRate || 0,
  };
}

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
      "id, text_uthmani, text_simple, translation_bm, transliteration, root, lemma, pos, frequency, word_occurrences(ayah_id, position, ayat(surah_id, ayah_number))",
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
