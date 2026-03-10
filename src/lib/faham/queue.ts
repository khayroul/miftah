import type { FahamSourceType } from "@/types/database";
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
  materializeNewFahamCards,
} from "./repository";

interface QueueOverrides {
  directionMode?: FahamMcqDirectionMode;
  dueLimit?: number;
  minDistinctContextCount?: number;
  minExposureEventCount?: number;
  minOccurrenceWeight?: number;
  newLimit?: number;
  pauseNewCardsAboveDueCount?: number;
  preferredSources?: FahamSourceType[];
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
  kind: "due" | "new";
  mcq: FahamBuiltMcq;
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
  stats: {
    dueCount: number;
    eligibleNewCount: number;
    totalCandidateCount: number;
  };
}

function serializeDueCard(
  card: Awaited<ReturnType<typeof getDueFahamCards>>[number],
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
    kind: "due",
    mcq,
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
  const [dueCards, candidates] = await Promise.all([
    getDueFahamCards(
      userId,
      Math.max(config.dueLimit, config.pauseNewCardsAboveDueCount),
    ),
    getFahamExposureCandidates(userId, config.candidatePoolSize),
  ]);

  const plan = buildFahamQueuePlan({
    candidates,
    config,
    dueCards,
  });
  const newCards = await materializeNewFahamCards(userId, plan.newCandidates);
  const mcqPool = await getFahamMcqWordPool(1200);
  const directionMode = overrides.directionMode ?? "arab_to_bm";
  const candidateByWordId = new Map(
    plan.newCandidates.map((candidate) => [candidate.word.id, candidate]),
  );
  const surfacedDueCards = plan.dueCards
    .map((card) => serializeDueCard(card, mcqPool, directionMode))
    .filter((card): card is SerializedFahamCard => card !== null);
  const surfacedNewCards: SerializedFahamCard[] = [];

  for (const card of newCards) {
    const serialized = serializeDueCard(card, mcqPool, directionMode);
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
      kind: "new",
    });
  }

  return {
    blockedReason: plan.blockedReason,
    due: surfacedDueCards,
    new: surfacedNewCards,
    stats: plan.stats,
  };
}
