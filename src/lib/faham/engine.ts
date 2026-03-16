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
  sessionSize: 10,
  minDistinctContextCount: 1, // Available immediately
  minExposureEventCount: 1,   // Available immediately
  minOccurrenceWeight: 1,     // Available immediately
  newWeight: 0.65,
  dueWeight: 0.25,
  masteredWeight: 0.10,       // Strictly 10%
  pauseNewCardsAboveDueCount: 100, // Relaxed backlog threshold
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
  _config: FahamEngineConfig,
): boolean {
  // Always available if encountered at least once
  return candidate.summary.exposure_event_count >= 1;
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
  // PRIORITY 1: Recency (latest encountered first)
  const recencyDelta =
    new Date(right.summary.last_exposed_at).getTime() -
    new Date(left.summary.last_exposed_at).getTime();
  if (recencyDelta !== 0) {
    return recencyDelta;
  }

  // PRIORITY 2: Score (sources, frequency, etc)
  const scoreDelta = scoreFahamCandidate(right, config) - scoreFahamCandidate(left, config);
  if (scoreDelta !== 0) {
    return scoreDelta;
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
  learningCards?: FahamDueCard[];
  isRevision?: boolean;
}): FahamQueuePlan {
  const config = normalizeFahamEngineConfig(params.config);
  const total = config.sessionSize;
  const isRevision = params.isRevision ?? false;

  // 1. ALLOCATE MASTERED (Strict 10%)
  const targetMasteredCount = Math.max(1, Math.floor(total * 0.10));
  const masteredCards = params.masteredCards.slice(0, targetMasteredCount);

  // 2. FILL REMAINING SLOTS WITH DUE THEN LEARNING (even if not due) THEN NEW
  let remainingSlots = total - masteredCards.length;
  
  // Prioritize due cards
  const dueCards = params.dueCards.slice(0, remainingSlots);
  remainingSlots -= dueCards.length;

  // If we still have slots and we have cards being learned (not yet due), take them
  // This helps when the user wants to "push mastery fast" by reviewing even if not technically due.
  const learningCards: FahamDueCard[] = [];
  if (remainingSlots > 0 && params.learningCards) {
    const additionalLearning = params.learningCards.slice(0, remainingSlots);
    learningCards.push(...additionalLearning);
    remainingSlots -= additionalLearning.length;
  }

  // Then fill with new candidates
  const newCandidates = remainingSlots > 0 
    ? selectNewFahamCandidates(params.candidates, config, remainingSlots)
    : [];
  remainingSlots -= newCandidates.length;

  // 3. IF STILL SLOTS REMAINING (e.g. no more due/learning/new), fill more mastered
  if (remainingSlots > 0) {
    const extraMasteredNeeded = remainingSlots;
    const additionalMastered = params.masteredCards.slice(
      masteredCards.length,
      masteredCards.length + extraMasteredNeeded,
    );
    masteredCards.push(...additionalMastered);
  }

  const eligibleNewCount = params.candidates.filter((candidate) =>
    isEligibleForNewCard(candidate, config),
  ).length;

  // Revision mode ignores the due_backlog block to allow constant availability
  if (!isRevision && params.dueCards.length >= config.pauseNewCardsAboveDueCount) {
    return {
      blockedReason: "due_backlog",
      dueCards,
      learningCards,
      masteredCards,
      newCandidates: [],
      stats: {
        dueCount: params.dueCards.length,
        eligibleNewCount,
        totalCandidateCount: params.candidates.length,
        masteredCount: params.masteredCards.length,
        learningCount: params.learningCards?.length ?? 0,
      },
    };
  }

  return {
    blockedReason: null,
    dueCards,
    learningCards,
    masteredCards,
    newCandidates,
    stats: {
      dueCount: params.dueCards.length,
      eligibleNewCount,
      totalCandidateCount: params.candidates.length,
      masteredCount: params.masteredCards.length,
      learningCount: params.learningCards?.length ?? 0,
    },
  };
}
