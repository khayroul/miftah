import type { FahamSourceType } from "@/types/database";
import { TOP_FAHAM_WORD_LIMIT } from "./config";
import type { FahamBuiltMcq, FahamMcqDirectionMode } from "./mcq";
import { buildFahamMcqForWord, normalizeMalayMeaning } from "./mcq";
import {
  buildFahamQueuePlan,
  normalizeFahamEngineConfig,
} from "./engine";
import {
  getDueFahamCards,
  getFahamExposureCandidates,
  getFahamMcqWordPool,
  getLearningFahamCards,
  getMasteredFahamCards,
  materializeNewFahamCards,
} from "./repository";

interface QueueOverrides {
  directionMode?: FahamMcqDirectionMode;
  dueLimit?: number;
  sessionSize?: number;
  minDistinctContextCount?: number;
  minExposureEventCount?: number;
  minOccurrenceWeight?: number;
  newLimit?: number;
  newWeight?: number;
  dueWeight?: number;
  masteredWeight?: number;
  pauseNewCardsAboveDueCount?: number;
  preferredSources?: FahamSourceType[];
  isRevision?: boolean;
}

export interface SerializedFahamCard {
  due: string;
  exposure?: {
    distinctContextCount: number;
    exposureEventCount: number;
    hifzOccurrenceWeight: number;
    readingOccurrenceWeight: number;
    themeOccurrenceWeight: number;
  };
  kind: "due" | "new" | "mastered";
  mcq: FahamBuiltMcq;
  mistakeStreak: number;
  needsReinforcement: boolean;
  progressId: number;
  reps: number;
  state: number;
  word: {
    frequency: number;
    id: number;
    textSimple: string;
    textUthmani: string;
    translationBm: string | null;
    translationEn: string | null;
    transliteration: string | null;
  };
}

export interface FahamQueueSnapshot {
  blockedReason: "due_backlog" | null;
  due: SerializedFahamCard[];
  new: SerializedFahamCard[];
  mastered: SerializedFahamCard[];
  learning: SerializedFahamCard[];
  stats: {
    dueCount: number;
    eligibleNewCount: number;
    focusWordLimit: number;
    totalCandidateCount: number;
    masteredCount: number;
    learningCount: number;
  };
}

type FahamDueCard = Awaited<ReturnType<typeof getDueFahamCards>>[number];

function serializeCard(
  card: FahamDueCard,
  kind: "due" | "new" | "mastered",
  mcqPool: Awaited<ReturnType<typeof getFahamMcqWordPool>>,
  directionMode: FahamMcqDirectionMode,
): SerializedFahamCard | null {
  const translationBm = normalizeMalayMeaning(card.word.translation_bm);
  const mcq = buildFahamMcqForWord(card.word, mcqPool, directionMode);
  if (!translationBm || !mcq) {
    return null;
  }

  return {
    due: card.progress.due,
    kind,
    mcq,
    mistakeStreak: card.progress.mistake_streak,
    needsReinforcement: card.progress.needs_reinforcement,
    progressId: card.progress.id,
    reps: card.progress.reps,
    state: card.progress.state,
    word: {
      frequency: card.word.frequency,
      id: card.word.id,
      textSimple: card.word.text_simple,
      textUthmani: card.word.text_uthmani,
      translationBm,
      translationEn: card.word.translation_en,
      transliteration: card.word.transliteration,
    },
  };
}

export async function buildFahamQueueSnapshot(
  userId: string,
  overrides: QueueOverrides = {},
): Promise<FahamQueueSnapshot> {
  const config = normalizeFahamEngineConfig(overrides);
  const [dueCardsPool, candidatesPool, masteredPool, learningPool] = await Promise.all([
    getDueFahamCards(
      userId,
      Math.max(config.sessionSize, config.pauseNewCardsAboveDueCount),
    ),
    getFahamExposureCandidates(userId, config.candidatePoolSize),
    getMasteredFahamCards(userId, config.sessionSize),
    getLearningFahamCards(userId, config.sessionSize),
  ]);

  const plan = buildFahamQueuePlan({
    candidates: candidatesPool,
    config,
    dueCards: dueCardsPool,
    masteredCards: masteredPool,
    learningCards: learningPool,
    isRevision: overrides.isRevision,
  });

  const [newCards, mcqPool] = await Promise.all([
    materializeNewFahamCards(userId, plan.newCandidates),
    getFahamMcqWordPool(1200),
  ]);

  const directionMode = overrides.directionMode ?? "arab_to_bm";
  const candidateByWordId = new Map(
    plan.newCandidates.map((candidate) => [candidate.word.id, candidate]),
  );

  const surfacedDueCards = plan.dueCards
    .map((card) => serializeCard(card, "due", mcqPool, directionMode))
    .filter((card): card is SerializedFahamCard => card !== null);

  const surfacedMasteredCards = plan.masteredCards
    .map((card) => serializeCard(card, "mastered", mcqPool, directionMode))
    .filter((card): card is SerializedFahamCard => card !== null);

  const surfacedLearningCards = (plan.learningCards ?? [])
    .map((card) => serializeCard(card, "due" as any, mcqPool, directionMode)) // Treat as "due" in kind for now to simplify UI logic, but can separate later
    .filter((card): card is SerializedFahamCard => card !== null);

  const surfacedNewCards: SerializedFahamCard[] = [];
  for (const card of newCards) {
    const serialized = serializeCard(card, "new", mcqPool, directionMode);
    if (!serialized) {
      continue;
    }

    const candidate = candidateByWordId.get(card.word.id);
    surfacedNewCards.push({
      ...serialized,
      exposure: candidate
        ? {
            distinctContextCount: candidate.summary.distinct_context_count,
            exposureEventCount: candidate.summary.exposure_event_count,
            hifzOccurrenceWeight: candidate.summary.hifz_occurrence_weight,
            readingOccurrenceWeight: candidate.summary.reading_occurrence_weight,
            themeOccurrenceWeight: candidate.summary.theme_occurrence_weight,
          }
        : undefined,
    });
  }

  return {
    blockedReason: plan.blockedReason,
    due: surfacedDueCards,
    new: surfacedNewCards,
    mastered: surfacedMasteredCards,
    learning: surfacedLearningCards,
    stats: {
      ...plan.stats,
      focusWordLimit: TOP_FAHAM_WORD_LIMIT,
    },
  };
}
