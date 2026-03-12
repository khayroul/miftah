import type { FahamSourceType } from "@/types/database";
import { TOP_FAHAM_WORD_LIMIT } from "./config";
import {
  buildFahamLevelProgress,
  getFahamLevelState,
  type FahamLevelProgress,
} from "./levels";
import type { FahamBuiltMcq, FahamMcqDirectionMode } from "./mcq";
import { buildFahamMcqForWord, normalizeMalayMeaning } from "./mcq";
import {
  buildFahamQueuePlan,
  normalizeFahamEngineConfig,
} from "./engine";
import {
  getBootstrapFahamCards,
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
  levelProgress: FahamLevelProgress;
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
  const levelState = await getFahamLevelState(userId);
  const levelProgress = buildFahamLevelProgress(levelState);
  const focusWordLimit = levelState.activeWordLimit;
  const reinforcementPoolLimit = Math.max(config.sessionSize * 6, 120);
  const [dueCardsPool, candidatesPool, masteredPool, learningPool] = await Promise.all([
    getDueFahamCards(
      userId,
      Math.max(reinforcementPoolLimit, config.pauseNewCardsAboveDueCount),
      focusWordLimit,
    ),
    getFahamExposureCandidates(userId, config.candidatePoolSize, focusWordLimit),
    getMasteredFahamCards(userId, reinforcementPoolLimit, focusWordLimit),
    getLearningFahamCards(userId, reinforcementPoolLimit, focusWordLimit),
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
    getFahamMcqWordPool(1200, focusWordLimit),
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
    .map((card) => serializeCard(card, "due", mcqPool, directionMode))
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

  const surfaceCount =
    surfacedDueCards.length +
    surfacedLearningCards.length +
    surfacedMasteredCards.length +
    surfacedNewCards.length;
  if (surfaceCount === 0) {
    const fallbackQueue: SerializedFahamCard[] = [];
    const seenProgressIds = new Set<number>();
    const pushUnique = (card: SerializedFahamCard | null) => {
      if (!card || seenProgressIds.has(card.progressId)) {
        return;
      }
      seenProgressIds.add(card.progressId);
      fallbackQueue.push(card);
    };

    for (const card of learningPool) {
      if (fallbackQueue.length >= config.sessionSize) break;
      pushUnique(serializeCard(card, "due", mcqPool, directionMode));
    }
    for (const card of dueCardsPool) {
      if (fallbackQueue.length >= config.sessionSize) break;
      pushUnique(serializeCard(card, "due", mcqPool, directionMode));
    }
    for (const card of masteredPool) {
      if (fallbackQueue.length >= config.sessionSize) break;
      pushUnique(serializeCard(card, "mastered", mcqPool, directionMode));
    }

    if (fallbackQueue.length < config.sessionSize) {
      const bootstrapCards = await getBootstrapFahamCards(
        userId,
        config.sessionSize - fallbackQueue.length,
        focusWordLimit,
      );
      for (const card of bootstrapCards) {
        if (fallbackQueue.length >= config.sessionSize) break;
        pushUnique(serializeCard(card, "new", mcqPool, directionMode));
      }
    }

    const fallbackDueCards = fallbackQueue.filter((card) => card.kind === "due");
    const fallbackMasteredCards = fallbackQueue.filter((card) => card.kind === "mastered");
    const fallbackNewCards = fallbackQueue.filter((card) => card.kind === "new");

    return {
      blockedReason: plan.blockedReason,
      due: fallbackDueCards,
      levelProgress,
      new: fallbackNewCards,
      mastered: fallbackMasteredCards,
      learning: [],
      stats: {
        ...plan.stats,
        focusWordLimit: Math.min(TOP_FAHAM_WORD_LIMIT, focusWordLimit),
      },
    };
  }

  return {
    blockedReason: plan.blockedReason,
    due: surfacedDueCards,
    levelProgress,
    new: surfacedNewCards,
    mastered: surfacedMasteredCards,
    learning: surfacedLearningCards,
    stats: {
      ...plan.stats,
      focusWordLimit: Math.min(TOP_FAHAM_WORD_LIMIT, focusWordLimit),
    },
  };
}
