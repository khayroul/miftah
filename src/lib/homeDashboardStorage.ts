import type { DailyGoalType } from "./activity";
import type { FahamLevelProgress } from "./faham/levels";
import type {
  HomeDashboardSnapshot,
  HomeFahamSnapshot,
  HomeHifzSnapshot,
  HomeReadSnapshot,
  HomeTemaSnapshot,
} from "./homeDashboard";

const STORAGE_KEY_PREFIX = "miftah.home.dashboard.v1";
const EMPTY_HOME_DASHBOARD_SNAPSHOT: HomeDashboardSnapshot = {
  faham: null,
  hifz: null,
  read: null,
  tema: null,
  activity: null,
};

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getStorage(): StorageLike | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function buildStorageKey(userId: string): string {
  return `${STORAGE_KEY_PREFIX}:${userId}`;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function asStringOrNull(value: unknown): string | null {
  if (value === null) {
    return null;
  }

  return typeof value === "string" ? value : null;
}

function asDailyGoalType(value: unknown): DailyGoalType | null {
  return value === "faham_words" ||
    value === "read_pages" ||
    value === "hifz_ayat" ||
    value === "hifz_pages" ||
    value === "theme_chunks"
    ? value
    : null;
}

function sanitizeFahamLevelProgress(raw: unknown): FahamLevelProgress | null {
  if (!isRecord(raw)) {
    return null;
  }

  const activeLevel = asNumber(raw.activeLevel);
  const activeWordLimit = asNumber(raw.activeWordLimit);
  const isMaxLevel = asBoolean(raw.isMaxLevel);
  const lemmaUnlocked = asBoolean(raw.lemmaUnlocked);
  const maxLevel = asNumber(raw.maxLevel);
  const nextLevel = raw.nextLevel === null ? null : asNumber(raw.nextLevel);
  const nextWordLimit =
    raw.nextWordLimit === null ? null : asNumber(raw.nextWordLimit);
  const unlockFoundProgress = asNumber(raw.unlockFoundProgress);
  const unlockFoundRequired = asNumber(raw.unlockFoundRequired);
  const unlockMasteredProgress = asNumber(raw.unlockMasteredProgress);
  const unlockMasteredRequired = asNumber(raw.unlockMasteredRequired);
  const unlockReady = asBoolean(raw.unlockReady);

  if (
    activeLevel === null ||
    activeWordLimit === null ||
    isMaxLevel === null ||
    lemmaUnlocked === null ||
    maxLevel === null ||
    unlockFoundProgress === null ||
    unlockFoundRequired === null ||
    unlockMasteredProgress === null ||
    unlockMasteredRequired === null ||
    unlockReady === null ||
    raw.nextLevel !== null && nextLevel === null ||
    raw.nextWordLimit !== null && nextWordLimit === null
  ) {
    return null;
  }

  return {
    activeLevel,
    activeWordLimit,
    isMaxLevel,
    lemmaUnlocked,
    maxLevel,
    nextLevel,
    nextWordLimit,
    unlockFoundProgress,
    unlockFoundRequired,
    unlockMasteredProgress,
    unlockMasteredRequired,
    unlockReady,
  };
}

function sanitizeFahamSnapshot(raw: unknown): HomeFahamSnapshot | null {
  if (!isRecord(raw)) {
    return null;
  }

  const blockedReason =
    raw.blockedReason === null || raw.blockedReason === "due_backlog"
      ? raw.blockedReason
      : undefined;
  const coveragePct = asNumber(raw.coveragePct);
  const dueCount = asNumber(raw.dueCount);
  const encounteredWordCount = asNumber(raw.encounteredWordCount);
  const eligibleNewCount = asNumber(raw.eligibleNewCount);
  const focusWordLimit = asNumber(raw.focusWordLimit);
  const levelProgress = sanitizeFahamLevelProgress(raw.levelProgress);
  const masteredWordCount = asNumber(raw.masteredWordCount);
  const reviewedWordCount = asNumber(raw.reviewedWordCount);
  const totalCandidateCount = asNumber(raw.totalCandidateCount);
  const totalWords = asNumber(raw.totalWords);

  if (
    blockedReason === undefined ||
    coveragePct === null ||
    dueCount === null ||
    encounteredWordCount === null ||
    eligibleNewCount === null ||
    focusWordLimit === null ||
    levelProgress === null ||
    masteredWordCount === null ||
    reviewedWordCount === null ||
    totalCandidateCount === null ||
    totalWords === null
  ) {
    return null;
  }

  return {
    blockedReason,
    coveragePct,
    dueCount,
    encounteredWordCount,
    eligibleNewCount,
    focusWordLimit,
    levelProgress,
    masteredWordCount,
    reviewedWordCount,
    totalCandidateCount,
    totalWords,
  };
}

function sanitizeReadSnapshot(raw: unknown): HomeReadSnapshot | null {
  if (!isRecord(raw)) {
    return null;
  }

  const lastPage = raw.lastPage === null ? null : asNumber(raw.lastPage);
  const lastReadAt = asStringOrNull(raw.lastReadAt);
  const uniquePages7d = asNumber(raw.uniquePages7d);
  const uniquePagesLifetime = asNumber(raw.uniquePagesLifetime);

  if (
    lastReadAt === null && raw.lastReadAt !== null ||
    uniquePages7d === null ||
    uniquePagesLifetime === null ||
    raw.lastPage !== null && lastPage === null
  ) {
    return null;
  }

  return {
    lastPage,
    lastReadAt,
    uniquePages7d,
    uniquePagesLifetime,
  };
}

function sanitizeHifzSnapshot(raw: unknown): HomeHifzSnapshot | null {
  if (!isRecord(raw)) {
    return null;
  }

  const dueTodayPages = asNumber(raw.dueTodayPages);
  const manzilCoveragePct = asNumber(raw.manzilCoveragePct);
  const nextAyahKey = asStringOrNull(raw.nextAyahKey);
  const nextPageLabel = asStringOrNull(raw.nextPageLabel);
  const nextBlock =
    raw.nextBlock === null ||
    raw.nextBlock === "sabqi" ||
    raw.nextBlock === "sabak" ||
    raw.nextBlock === "manzil"
      ? raw.nextBlock
      : undefined;
  const nextPage = raw.nextPage === null ? null : asNumber(raw.nextPage);
  const streak = asNumber(raw.streak);
  const todayPages = asNumber(raw.todayPages);
  const totalManzilPages = asNumber(raw.totalManzilPages);

  if (
    dueTodayPages === null ||
    manzilCoveragePct === null ||
    nextAyahKey === null && raw.nextAyahKey !== null ||
    nextPageLabel === null && raw.nextPageLabel !== null ||
    nextBlock === undefined ||
    streak === null ||
    todayPages === null ||
    totalManzilPages === null ||
    raw.nextPage !== null && nextPage === null
  ) {
    return null;
  }

  return {
    dueTodayPages,
    manzilCoveragePct,
    nextAyahKey,
    nextPageLabel,
    nextBlock,
    nextPage,
    streak,
    todayPages,
    totalManzilPages,
  };
}

function sanitizeTemaSnapshot(raw: unknown): HomeTemaSnapshot | null {
  if (!isRecord(raw)) {
    return null;
  }

  const completedCount = asNumber(raw.completedCount);
  const completedPct = asNumber(raw.completedPct);
  const exploredCount = asNumber(raw.exploredCount);
  const exploredPct = asNumber(raw.exploredPct);
  const totalChunks = asNumber(raw.totalChunks);

  if (
    completedCount === null ||
    completedPct === null ||
    exploredCount === null ||
    exploredPct === null ||
    totalChunks === null
  ) {
    return null;
  }

  return {
    completedCount,
    completedPct,
    exploredCount,
    exploredPct,
    totalChunks,
  };
}

function sanitizeActivitySnapshot(
  raw: unknown,
): HomeDashboardSnapshot["activity"] {
  if (!isRecord(raw)) {
    return null;
  }

  const streak = asNumber(raw.streak);
  const dailyGoalCount = asNumber(raw.dailyGoalCount);
  const dailyGoalType = asDailyGoalType(raw.dailyGoalType);
  const todayProgress = asNumber(raw.todayProgress);
  const legacyHifzGoalRecommendation =
    raw.legacyHifzGoalRecommendation === null
      ? null
      : isRecord(raw.legacyHifzGoalRecommendation)
        ? raw.legacyHifzGoalRecommendation
        : undefined;

  if (
    streak === null ||
    dailyGoalCount === null ||
    dailyGoalType === null ||
    todayProgress === null ||
    legacyHifzGoalRecommendation === undefined
  ) {
    return null;
  }

  if (legacyHifzGoalRecommendation === null) {
    return {
      streak,
      dailyGoalCount,
      dailyGoalType,
      legacyHifzGoalRecommendation: null,
      todayProgress,
    };
  }

  const currentAyahGoal = asNumber(legacyHifzGoalRecommendation.currentAyahGoal);
  const suggestedPageGoal = asNumber(
    legacyHifzGoalRecommendation.suggestedPageGoal,
  );
  const targetType =
    legacyHifzGoalRecommendation.targetType === "hifz_pages"
      ? legacyHifzGoalRecommendation.targetType
      : null;

  if (
    currentAyahGoal === null ||
    suggestedPageGoal === null ||
    targetType === null
  ) {
    return null;
  }

  return {
    streak,
    dailyGoalCount,
    dailyGoalType,
    legacyHifzGoalRecommendation: {
      currentAyahGoal,
      suggestedPageGoal,
      targetType,
    },
    todayProgress,
  };
}

export function emptyHomeDashboardSnapshot(): HomeDashboardSnapshot {
  return { ...EMPTY_HOME_DASHBOARD_SNAPSHOT };
}

export function hasHomeDashboardData(snapshot: HomeDashboardSnapshot): boolean {
  return (
    snapshot.faham !== null ||
    snapshot.hifz !== null ||
    snapshot.read !== null ||
    snapshot.tema !== null ||
    snapshot.activity !== null
  );
}

export function sanitizeHomeDashboardSnapshot(
  raw: unknown,
): HomeDashboardSnapshot {
  if (!isRecord(raw)) {
    return emptyHomeDashboardSnapshot();
  }

  return {
    faham: raw.faham === null ? null : sanitizeFahamSnapshot(raw.faham),
    hifz: raw.hifz === null ? null : sanitizeHifzSnapshot(raw.hifz),
    read: raw.read === null ? null : sanitizeReadSnapshot(raw.read),
    tema: raw.tema === null ? null : sanitizeTemaSnapshot(raw.tema),
    activity:
      raw.activity === null ? null : sanitizeActivitySnapshot(raw.activity),
  };
}

export function loadHomeDashboardSnapshotCache(
  userId: string,
  storage: StorageLike | null = getStorage(),
): HomeDashboardSnapshot | null {
  if (!storage || userId.length === 0) {
    return null;
  }

  try {
    const raw = storage.getItem(buildStorageKey(userId));
    if (!raw) {
      return null;
    }

    return sanitizeHomeDashboardSnapshot(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveHomeDashboardSnapshotCache(
  userId: string,
  snapshot: HomeDashboardSnapshot,
  storage: StorageLike | null = getStorage(),
): boolean {
  if (!storage || userId.length === 0) {
    return false;
  }

  try {
    const normalized = sanitizeHomeDashboardSnapshot(snapshot);
    storage.setItem(buildStorageKey(userId), JSON.stringify(normalized));
    return true;
  } catch {
    return false;
  }
}
