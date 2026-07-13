import {
  FAHAM_LEMMA_UNLOCK_LEVEL,
  FAHAM_LEVEL_FOUND_UNLOCK_RATIO,
  FAHAM_LEVEL_MAHIR_UNLOCK_RATIO,
  FAHAM_LEVEL_WORD_LIMITS,
} from "./config";

interface FahamLevelMetricsInput {
  foundCount: number;
  masteredCount: number;
  wordLimit: number;
}

export interface FahamLevelMetrics extends FahamLevelMetricsInput {
  foundRequired: number;
  masteredRequired: number;
  unlocked: boolean;
}

export interface FahamLevelState {
  activeLevel: number;
  activeWordLimit: number;
  levels: FahamLevelMetrics[];
  maxLevel: number;
}

export interface FahamLevelProgress {
  activeLevel: number;
  activeWordLimit: number;
  isMaxLevel: boolean;
  lemmaUnlocked: boolean;
  maxLevel: number;
  nextLevel: number | null;
  nextWordLimit: number | null;
  unlockFoundProgress: number;
  unlockFoundRequired: number;
  unlockMasteredProgress: number;
  unlockMasteredRequired: number;
  unlockReady: boolean;
}

function requiredFound(wordLimit: number): number {
  return Math.ceil(wordLimit * FAHAM_LEVEL_FOUND_UNLOCK_RATIO);
}

function requiredMastered(foundCount: number): number {
  return Math.ceil(foundCount * FAHAM_LEVEL_MAHIR_UNLOCK_RATIO);
}

export function deriveFahamLevelState(
  metricsInput: FahamLevelMetricsInput[],
): FahamLevelState {
  const levels = metricsInput.map((metrics) => {
    const foundRequired = requiredFound(metrics.wordLimit);
    const masteredRequired = requiredMastered(metrics.foundCount);
    const unlocked =
      metrics.foundCount >= foundRequired &&
      metrics.masteredCount >= masteredRequired;

    return {
      ...metrics,
      foundRequired,
      masteredRequired,
      unlocked,
    };
  });

  let activeLevel = 1;
  for (let index = 0; index < levels.length - 1; index += 1) {
    if (!levels[index]?.unlocked) {
      break;
    }
    activeLevel = index + 2;
  }

  const activeWordLimit =
    levels[activeLevel - 1]?.wordLimit ??
    FAHAM_LEVEL_WORD_LIMITS[FAHAM_LEVEL_WORD_LIMITS.length - 1];

  return {
    activeLevel,
    activeWordLimit,
    levels,
    maxLevel: levels.length,
  };
}

export function buildFahamLevelProgress(
  state: FahamLevelState,
): FahamLevelProgress {
  const activeMetrics = state.levels[state.activeLevel - 1] ?? null;
  const isMaxLevel = state.activeLevel >= state.maxLevel;
  const nextLevel = isMaxLevel ? null : state.activeLevel + 1;
  const nextWordLimit = nextLevel ? state.levels[nextLevel - 1]?.wordLimit ?? null : null;

  if (!activeMetrics) {
    return {
      activeLevel: state.activeLevel,
      activeWordLimit: state.activeWordLimit,
      isMaxLevel,
      lemmaUnlocked: state.activeLevel >= FAHAM_LEMMA_UNLOCK_LEVEL,
      maxLevel: state.maxLevel,
      nextLevel,
      nextWordLimit,
      unlockFoundProgress: 0,
      unlockFoundRequired: 0,
      unlockMasteredProgress: 0,
      unlockMasteredRequired: 0,
      unlockReady: false,
    };
  }

  return {
    activeLevel: state.activeLevel,
    activeWordLimit: state.activeWordLimit,
    isMaxLevel,
    lemmaUnlocked: state.activeLevel >= FAHAM_LEMMA_UNLOCK_LEVEL,
    maxLevel: state.maxLevel,
    nextLevel,
    nextWordLimit,
    unlockFoundProgress: Math.min(activeMetrics.foundCount, activeMetrics.foundRequired),
    unlockFoundRequired: activeMetrics.foundRequired,
    unlockMasteredProgress: Math.min(
      activeMetrics.masteredCount,
      activeMetrics.masteredRequired,
    ),
    unlockMasteredRequired: activeMetrics.masteredRequired,
    unlockReady: activeMetrics.unlocked,
  };
}
