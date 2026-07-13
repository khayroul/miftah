import { supabaseServer } from "@/data/supabase/server";
import { TOP_FAHAM_WORD_LIMIT } from "@/features/faham/domain/config";
import type { VocabExposureSummary, VocabProgress, Word } from "@/shared/types/database";
import { getOrCreateVocabProgress } from "./faham-progress";
import type {
  FahamCandidateWord,
  FahamDueCard,
} from "@/features/faham/domain/types";
import {
  attachFirstOccurrences,
  FAHAM_WORD_COLUMNS,
  firstRelation,
  firstOccurrenceFor,
  getTopFahamWordIds,
  type WordOccurrenceLite,
} from "./faham-vocabulary";

interface VocabProgressWordJoinRow extends VocabProgress {
  words: Word | Word[] | null;
}

const VOCAB_PROGRESS_COLUMNS =
  "id, user_id, word_id, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, state, due, last_review, needs_reinforcement, mistake_streak, is_mastered, correct_streak, incorrect_streak, last_incorrect_at, created_at, updated_at";
const VOCAB_EXPOSURE_SUMMARY_COLUMNS =
  "user_id, word_id, exposure_event_count, distinct_context_count, distinct_source_count, total_occurrence_weight, reading_event_count, theme_event_count, hifz_event_count, reading_occurrence_weight, theme_occurrence_weight, hifz_occurrence_weight, last_exposed_at";
const VOCAB_PROGRESS_WITH_WORD_COLUMNS =
  `${VOCAB_PROGRESS_COLUMNS}, words!inner(${FAHAM_WORD_COLUMNS})`;

function toVocabProgress(row: VocabProgressWordJoinRow): VocabProgress {
  return {
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
  };
}

function toDueCards(
  rows: VocabProgressWordJoinRow[],
  firstOccurrences: Map<number, WordOccurrenceLite>,
): FahamDueCard[] {
  return rows
    .map<FahamDueCard | null>((row) => {
      const word = firstRelation(row.words);
      if (!word) {
        return null;
      }

      return {
        progress: toVocabProgress(row),
        word: {
          ...word,
          word_occurrences: firstOccurrences.get(word.id) ?? null,
        },
      };
    })
    .filter((row): row is FahamDueCard => row !== null);
}

async function hydrateProgressRows(
  rows: VocabProgressWordJoinRow[],
): Promise<FahamDueCard[]> {
  const firstOccurrences = await firstOccurrenceFor(
    rows.map((row) => row.word_id),
  );
  return toDueCards(rows, firstOccurrences);
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
    .select(VOCAB_PROGRESS_WITH_WORD_COLUMNS)
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

  return hydrateProgressRows((data ?? []) as VocabProgressWordJoinRow[]);
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
    .select(VOCAB_EXPOSURE_SUMMARY_COLUMNS)
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
        .select(FAHAM_WORD_COLUMNS)
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

  const eligible = summaries
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
    .filter((row): row is { summary: VocabExposureSummary; word: Word } => row !== null);

  const firstOccurrences = await firstOccurrenceFor(
    eligible.map(({ word }) => word.id),
  );
  return eligible.map(({ summary, word }) => ({
    summary,
    word: {
      ...word,
      word_occurrences: firstOccurrences.get(word.id) ?? null,
    },
  }));
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
        .select(FAHAM_WORD_COLUMNS)
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

  const words = ((wordData ?? []) as Word[])
    .filter((word) => !knownWordIds.has(word.id))
    .slice(0, limit);
  const firstOccurrences = await firstOccurrenceFor(words.map((word) => word.id));
  const wordsWithOccurrences = attachFirstOccurrences(words, firstOccurrences);

  return Promise.all(
    wordsWithOccurrences.map(async (word) => ({
      progress: await getOrCreateVocabProgress(userId, word.id),
      word,
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
    .select(VOCAB_PROGRESS_WITH_WORD_COLUMNS)
    .eq("user_id", userId)
    .in("word_id", topWordIds)
    .eq("is_mastered", true)
    .order("last_review", { ascending: true }) // Review least recently reviewed mastered cards
    .limit(limit);
  if (error) {
    throw error;
  }

  return hydrateProgressRows((data ?? []) as VocabProgressWordJoinRow[]);
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
    .select(VOCAB_PROGRESS_WITH_WORD_COLUMNS)
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

  return hydrateProgressRows((data ?? []) as VocabProgressWordJoinRow[]);
}
