import { supabaseServer } from "@/data/supabase/server";
import { TOP_FAHAM_WORD_LIMIT } from "@/features/faham/domain/config";
import type { VocabExposureSummary, VocabProgress } from "@/types/database";
import { getOrCreateVocabProgress } from "./faham-progress";
import type {
  FahamCandidateWord,
  FahamDueCard,
  WordWithOccurrences,
} from "@/features/faham/domain/types";
import {
  firstRelation,
  getTopFahamWordIds,
  type RepoWordWithOccurrences,
} from "./faham-vocabulary";

interface VocabProgressWordJoinRow extends VocabProgress {
  words: RepoWordWithOccurrences | RepoWordWithOccurrences[] | null;
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
      "id, user_id, word_id, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, state, due, last_review, needs_reinforcement, mistake_streak, is_mastered, correct_streak, incorrect_streak, last_incorrect_at, created_at, updated_at, words!inner(id, text_uthmani, text_simple, translation_bm, translation_en, transliteration, root, lemma, pos, frequency, word_occurrences(ayah_id, position, page_number, ayat(surah_id, ayah_number)))",
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
          "id, text_uthmani, text_simple, translation_bm, translation_en, transliteration, root, lemma, pos, frequency, word_occurrences(ayah_id, position, page_number, ayat(surah_id, ayah_number))",
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
          "id, text_uthmani, text_simple, translation_bm, translation_en, transliteration, root, lemma, pos, frequency, word_occurrences(ayah_id, position, page_number, ayat(surah_id, ayah_number))",
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
      "id, user_id, word_id, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, state, due, last_review, needs_reinforcement, mistake_streak, is_mastered, correct_streak, incorrect_streak, last_incorrect_at, created_at, updated_at, words!inner(id, text_uthmani, text_simple, translation_bm, translation_en, transliteration, root, lemma, pos, frequency, word_occurrences(ayah_id, position, page_number, ayat(surah_id, ayah_number)))",
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
      "id, user_id, word_id, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, state, due, last_review, needs_reinforcement, mistake_streak, is_mastered, correct_streak, incorrect_streak, last_incorrect_at, created_at, updated_at, words!inner(id, text_uthmani, text_simple, translation_bm, translation_en, transliteration, root, lemma, pos, frequency, word_occurrences(ayah_id, position, page_number, ayat(surah_id, ayah_number)))",
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
