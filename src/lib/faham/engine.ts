import type { FahamSourceType, VocabExposureSummary, Word } from "@/types/database";
import type {
  FahamCandidateWord,
  FahamDueCard,
  FahamEngineConfig,
  FahamQueuePlan,
} from "./types";

export const DEFAULT_FAHAM_ENGINE_CONFIG: FahamEngineConfig = {
  candidatePoolSize: 240,
  dueLimit: 20,
  sessionSize: 20,
  minDistinctContextCount: 2,
  minExposureEventCount: 3,
  minOccurrenceWeight: 5,
  newWeight: 0.60,
  dueWeight: 0.25,
  masteredWeight: 0.15,
  pauseNewCardsAboveDueCount: 40,
  preferredSources: ["reading_page", "theme_chunk", "hifz_ayah"],
};

const SOURCE_WEIGHT_FALLBACK = 1;
const SOURCE_WEIGHT_BY_ORDER = [7, 5, 3] as const;

function sourceOccurrenceWeight(
  summary: VocabExposureSummary,
  source: FahamSourceType,
): number {
  if (source === "reading_page") {
    return summary.reading_occurrence_weight;
  }
  if (source === "theme_chunk") {
    return summary.theme_occurrence_weight;
  }
  return summary.hifz_occurrence_weight;
}

function buildSourceWeights(
  preferredSources: FahamSourceType[],
): Record<FahamSourceType, number> {
  const weights: Record<FahamSourceType, number> = {
    reading_page: SOURCE_WEIGHT_FALLBACK,
    theme_chunk: SOURCE_WEIGHT_FALLBACK,
    hifz_ayah: SOURCE_WEIGHT_FALLBACK,
  };

  preferredSources.forEach((source, index) => {
    weights[source] = SOURCE_WEIGHT_BY_ORDER[index] ?? SOURCE_WEIGHT_FALLBACK;
  });

  return weights;
}

function normalizePreferredSources(
  preferredSources: FahamSourceType[],
): FahamSourceType[] {
  const seen = new Set<FahamSourceType>();
  const normalized: FahamSourceType[] = [];

  for (const source of preferredSources) {
    if (seen.has(source)) {
      continue;
    }
    seen.add(source);
    normalized.push(source);
  }

  return normalized.length > 0
    ? normalized
    : DEFAULT_FAHAM_ENGINE_CONFIG.preferredSources;
}

export function normalizeFahamEngineConfig(
  overrides: Partial<FahamEngineConfig>,
): FahamEngineConfig {
  return {
    ...DEFAULT_FAHAM_ENGINE_CONFIG,
    ...overrides,
    preferredSources: normalizePreferredSources(
      overrides.preferredSources ?? DEFAULT_FAHAM_ENGINE_CONFIG.preferredSources,
    ),
  };
}

function lexicalBonus(word: Word): number {
  let bonus = 0;
  if (word.root) {
    bonus += 6;
  }
  if (word.lemma) {
    bonus += 4;
  }
  if (word.translation_bm || word.translation_en) {
    bonus += 4;
  }
  return bonus;
}

function frequencyBonus(word: Word): number {
  return Math.min(word.frequency, 1200) / 40;
}

function preferenceScore(
  candidate: FahamCandidateWord,
  preferredSources: FahamSourceType[],
): number {
  const weights = buildSourceWeights(preferredSources);
  return (
    candidate.summary.reading_occurrence_weight * weights.reading_page +
    candidate.summary.theme_occurrence_weight * weights.theme_chunk +
    candidate.summary.hifz_occurrence_weight * weights.hifz_ayah
  );
}

export function isEligibleForNewCard(
  candidate: FahamCandidateWord,
  config: FahamEngineConfig,
): boolean {
  const summary = candidate.summary;
  return (
    summary.distinct_context_count >= config.minDistinctContextCount ||
    summary.exposure_event_count >= config.minExposureEventCount ||
    summary.total_occurrence_weight >= config.minOccurrenceWeight
  );
}

export function scoreFahamCandidate(
  candidate: FahamCandidateWord,
  config: FahamEngineConfig,
): number {
  const summary = candidate.summary;
  return (
    preferenceScore(candidate, config.preferredSources) * 10 +
    summary.distinct_context_count * 26 +
    summary.exposure_event_count * 14 +
    summary.distinct_source_count * 9 +
    summary.total_occurrence_weight * 6 +
    frequencyBonus(candidate.word) +
    lexicalBonus(candidate.word)
  );
}

function compareCandidates(
  left: FahamCandidateWord,
  right: FahamCandidateWord,
  config: FahamEngineConfig,
): number {
  const scoreDelta = scoreFahamCandidate(right, config) - scoreFahamCandidate(left, config);
  if (scoreDelta !== 0) {
    return scoreDelta;
  }

  const recencyDelta =
    new Date(right.summary.last_exposed_at).getTime() -
    new Date(left.summary.last_exposed_at).getTime();
  if (recencyDelta !== 0) {
    return recencyDelta;
  }

  const sourceDelta =
    sourceOccurrenceWeight(right.summary, config.preferredSources[0]) -
    sourceOccurrenceWeight(left.summary, config.preferredSources[0]);
  if (sourceDelta !== 0) {
    return sourceDelta;
  }

  return right.word.frequency - left.word.frequency;
}

export function selectNewFahamCandidates(
  candidates: FahamCandidateWord[],
  config: FahamEngineConfig,
  limit: number,
): FahamCandidateWord[] {
  return candidates
    .filter((candidate) => isEligibleForNewCard(candidate, config))
    .sort((left, right) => compareCandidates(left, right, config))
    .slice(0, limit);
}

export function buildFahamQueuePlan(params: {
  candidates: FahamCandidateWord[];
  config: FahamEngineConfig;
  dueCards: FahamDueCard[];
  masteredCards: FahamDueCard[];
}): FahamQueuePlan {
  const config = normalizeFahamEngineConfig(params.config);
  const total = config.sessionSize;

  // Calculate target counts for each bucket
  const targetDueCount = Math.floor(total * config.dueWeight);
  const targetMasteredCount = Math.floor(total * config.masteredWeight);
  const targetNewCount = total - targetDueCount - targetMasteredCount;

  // Fill buckets
  const dueCards = params.dueCards.slice(0, targetDueCount);
  const masteredCards = params.masteredCards.slice(0, targetMasteredCount);
  
  // Allocate remaining slots to "new" cards
  const remainingSlots = total - dueCards.length - masteredCards.length;
  const newCandidates = selectNewFahamCandidates(
    params.candidates,
    config,
    remainingSlots,
  );

  const eligibleNewCount = params.candidates.filter((candidate) =>
    isEligibleForNewCard(candidate, config),
  ).length;

  if (params.dueCards.length >= config.pauseNewCardsAboveDueCount) {
    return {
      blockedReason: "due_backlog",
      dueCards,
      masteredCards,
      newCandidates: [],
      stats: {
        dueCount: params.dueCards.length,
        eligibleNewCount,
        totalCandidateCount: params.candidates.length,
        masteredCount: params.masteredCards.length,
      },
    };
  }

  return {
    blockedReason: null,
    dueCards,
    masteredCards,
    newCandidates,
    stats: {
      dueCount: params.dueCards.length,
      eligibleNewCount,
      totalCandidateCount: params.candidates.length,
      masteredCount: params.masteredCards.length,
    },
  };
}
