import {
  getHomeFahamCounts,
  getHomeReadDashboardData,
  getHomeTemaCounts,
} from "@/data/repositories/home";
import {
  buildFahamLevelProgress,
  buildFahamQueuePlan,
  DEFAULT_FAHAM_ENGINE_CONFIG,
  TOP_FAHAM_WORD_LIMIT,
  type FahamLevelProgress,
} from "@/features/faham/server";
import { getFahamLevelState } from "@/data/repositories/faham-levels";
import {
  getDueFahamCards,
  getFahamExposureCandidates,
  getTopFahamWordIds,
} from "@/data/repositories/faham";
import { buildDailyPlanWithDetails } from "@/data/repositories/hifz";
import { hasAnyHifzProgress } from "@/data/repositories/hifz";
import { getHifzStats } from "@/data/repositories/hifz";
import { getReadPageActivityRows } from "@/data/repositories/activity";
import {
  getUserStreak,
  getUserDailyGoal,
  getDailyActivityCount,
} from "@/data/repositories/activity";
import {
  recommendHifzPageGoalFromAyahGoal,
  type ActivityType,
  type DailyGoalType,
} from "@/shared/activity";
import type { PlanItem } from "@/data/repositories/hifz";

const TOTAL_QURAN_PAGES = 604;

export interface HomeFahamSnapshot {
  blockedReason: "due_backlog" | null;
  coveragePct: number;
  dueCount: number;
  encounteredWordCount: number;
  eligibleNewCount: number;
  focusWordLimit: number;
  levelProgress: FahamLevelProgress;
  masteredWordCount: number;
  reviewedWordCount: number;
  totalCandidateCount: number;
  totalWords: number;
}

export interface HomeReadSnapshot {
  lastPage: number | null;
  lastReadAt: string | null;
  uniquePages7d: number;
  uniquePagesLifetime: number;
}

export interface HomeHifzSnapshot {
  dueTodayPages: number;
  manzilCoveragePct: number;
  nextAyahKey: string | null;
  nextPageLabel: string | null;
  nextBlock: "sabqi" | "sabak" | "manzil" | null;
  nextPage: number | null;
  streak: number;
  todayPages: number;
  totalManzilPages: number;
}

export interface HomeTemaSnapshot {
  completedCount: number;
  completedPct: number;
  exploredCount: number;
  exploredPct: number;
  totalChunks: number;
}

export interface HomeDashboardSnapshot {
  faham: HomeFahamSnapshot | null;
  hifz: HomeHifzSnapshot | null;
  read: HomeReadSnapshot | null;
  tema: HomeTemaSnapshot | null;
  activity: {
    streak: number;
    dailyGoalCount: number;
    dailyGoalType: DailyGoalType;
    legacyHifzGoalRecommendation: {
      currentAyahGoal: number;
      suggestedPageGoal: number;
      targetType: "hifz_pages";
    } | null;
    todayProgress: number;
  } | null;
}

function percentage(value: number, total: number): number {
  if (total <= 0) {
    return 0;
  }

  return Math.min(100, Math.round((value / total) * 100));
}

function resolveNextPlanEntry(
  plan: Awaited<ReturnType<typeof buildDailyPlanWithDetails>>,
): { block: "sabqi" | "sabak" | "manzil"; item: PlanItem } | null {
  if (plan.sabqi[0]) {
    return { block: "sabqi", item: plan.sabqi[0] };
  }
  if (plan.sabak[0]) {
    return { block: "sabak", item: plan.sabak[0] };
  }
  if (plan.manzil[0]) {
    return { block: "manzil", item: plan.manzil[0] };
  }
  return null;
}

function nextPageLabel(
  nextEntry: { block: "sabqi" | "sabak" | "manzil"; item: PlanItem } | null,
): string | null {
  if (!nextEntry) {
    return null;
  }

  return `Halaman ${nextEntry.item.ayah.pageNumber} · ${nextEntry.item.ayah.surahNameTranslit}`;
}

function countUniquePlanPages(plan: Awaited<ReturnType<typeof buildDailyPlanWithDetails>>): number {
  return new Set(
    [...plan.sabqi, ...plan.sabak, ...plan.manzil].map((item) => item.ayah.pageNumber),
  ).size;
}

async function loadHifzSnapshot(userId: string): Promise<HomeHifzSnapshot> {
  const hasStarted = await hasAnyHifzProgress(userId);
  if (!hasStarted) {
    return {
      dueTodayPages: 0,
      manzilCoveragePct: 0,
      nextAyahKey: null,
      nextPageLabel: null,
      nextBlock: null,
      nextPage: null,
      streak: 0,
      todayPages: 0,
      totalManzilPages: 0,
    };
  }

  const [plan, stats] = await Promise.all([
    buildDailyPlanWithDetails(userId),
    getHifzStats(userId),
  ]);
  const nextEntry = resolveNextPlanEntry(plan);

  return {
    dueTodayPages: stats.dueTodayPages,
    manzilCoveragePct: percentage(stats.totalManzilPages, TOTAL_QURAN_PAGES),
    nextAyahKey: nextEntry
      ? `${nextEntry.item.ayah.surahId}:${nextEntry.item.ayah.ayahNumber}`
      : null,
    nextPageLabel: nextPageLabel(nextEntry),
    nextBlock: nextEntry?.block ?? null,
    nextPage: nextEntry?.item.ayah.pageNumber ?? null,
    streak: stats.streak,
    todayPages: countUniquePlanPages(plan),
    totalManzilPages: stats.totalManzilPages,
  };
}

async function loadFahamSnapshot(userId: string): Promise<HomeFahamSnapshot> {
  const config = DEFAULT_FAHAM_ENGINE_CONFIG;
  const now = new Date().toISOString();
  const [topWordIds, levelState] = await Promise.all([
    getTopFahamWordIds(),
    getFahamLevelState(userId),
  ]);
  const levelProgress = buildFahamLevelProgress(levelState);
  if (topWordIds.length === 0) {
    return {
      blockedReason: null,
      coveragePct: 0,
      dueCount: 0,
      encounteredWordCount: 0,
      eligibleNewCount: 0,
      focusWordLimit: levelProgress.activeWordLimit,
      levelProgress,
      masteredWordCount: 0,
      reviewedWordCount: 0,
      totalCandidateCount: 0,
      totalWords: TOP_FAHAM_WORD_LIMIT,
    };
  }

  const focusWordIds = await getTopFahamWordIds(levelProgress.activeWordLimit);
  if (focusWordIds.length === 0) {
    return {
      blockedReason: null,
      coveragePct: 0,
      dueCount: 0,
      encounteredWordCount: 0,
      eligibleNewCount: 0,
      focusWordLimit: levelProgress.activeWordLimit,
      levelProgress,
      masteredWordCount: 0,
      reviewedWordCount: 0,
      totalCandidateCount: 0,
      totalWords: levelProgress.activeWordLimit,
    };
  }
  const [dueCards, candidates, counts] = await Promise.all([
    getDueFahamCards(
      userId,
      Math.max(config.dueLimit, config.pauseNewCardsAboveDueCount),
      levelProgress.activeWordLimit,
    ),
    getFahamExposureCandidates(userId, config.candidatePoolSize, levelProgress.activeWordLimit),
    getHomeFahamCounts(userId, focusWordIds, now),
  ]);
  const plan = buildFahamQueuePlan({
    candidates,
    config,
    dueCards,
    masteredCards: [],
  });
  const { dueCount, encounteredWordCount, masteredWordCount, reviewedWordCount } = counts;
  const totalWords = levelProgress.activeWordLimit;

  return {
    blockedReason: plan.blockedReason,
    coveragePct: percentage(encounteredWordCount, levelProgress.activeWordLimit),
    dueCount,
    encounteredWordCount,
    eligibleNewCount: plan.stats.eligibleNewCount,
    focusWordLimit: levelProgress.activeWordLimit,
    levelProgress,
    masteredWordCount,
    reviewedWordCount,
    totalCandidateCount: plan.stats.totalCandidateCount,
    totalWords,
  };
}

async function loadTemaSnapshot(userId: string): Promise<HomeTemaSnapshot> {
  const { completedCount, exploredSourceKeys, totalChunks } = await getHomeTemaCounts(userId);
  const exploredCount = new Set(exploredSourceKeys).size;

  return {
    completedCount,
    completedPct: percentage(completedCount, totalChunks),
    exploredCount,
    exploredPct: percentage(exploredCount, totalChunks),
    totalChunks,
  };
}

async function loadReadSnapshot(userId: string): Promise<HomeReadSnapshot> {
  const [readDashboardData, readEventRows] = await Promise.all([
    getHomeReadDashboardData(userId),
    getReadPageActivityRows(userId),
  ]);

  const uniquePagesLifetime = new Set<number>();
  const uniquePages7d = new Set<number>();
  const cutoffKey = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const rows = readDashboardData.activityRows;
  for (const row of readEventRows) {
    if (!row.entityId) {
      continue;
    }
    uniquePagesLifetime.add(row.entityId);
    if (row.activityDate >= cutoffKey) {
      uniquePages7d.add(row.entityId);
    }
  }

  for (const row of rows) {
    const meta = row.metadata as { page?: unknown; pages?: unknown };
    const pages = Array.isArray(meta?.pages)
      ? meta.pages.filter((value): value is number => typeof value === "number")
      : typeof meta?.page === "number"
        ? [meta.page]
        : [];
    for (const page of pages) {
      uniquePagesLifetime.add(page);
      if (row.activityDate >= cutoffKey) {
        uniquePages7d.add(page);
      }
    }
  }

  return {
    lastPage: readDashboardData.readingState?.lastPage ?? null,
    lastReadAt: readDashboardData.readingState?.lastReadAt ?? null,
    uniquePages7d: uniquePages7d.size,
    uniquePagesLifetime: uniquePagesLifetime.size,
  };
}

async function loadActivitySnapshot(userId: string) {
  const goalTypeToActivityMetric = (
    value: DailyGoalType,
  ): { hifzUnit?: "ayah" | "page"; type: ActivityType } => {
    if (value === "read_pages") {
      return { type: "read" };
    }
    if (value === "hifz_ayat") {
      return { type: "hifz", hifzUnit: "ayah" };
    }
    if (value === "hifz_pages") {
      return { type: "hifz", hifzUnit: "page" };
    }
    if (value === "theme_chunks") {
      return { type: "theme" };
    }
    return { type: "faham" };
  };

  const [streak, goal, todayProgress] = await Promise.all([
    getUserStreak(userId),
    getUserDailyGoal(userId),
    // We need to know which type to count based on the goal
  ]).then(async ([streak, goal]) => {
    const metric = goalTypeToActivityMetric(goal.type);
    const progress = await getDailyActivityCount(
      userId,
      metric.type,
      metric,
    );
    return [streak, goal, progress] as const;
  });

  return {
    streak: streak?.current_streak ?? 0,
    dailyGoalCount: goal.count,
    dailyGoalType: goal.type,
    legacyHifzGoalRecommendation:
      goal.type === "hifz_ayat"
        ? {
            currentAyahGoal: goal.count,
            suggestedPageGoal: recommendHifzPageGoalFromAyahGoal(goal.count),
            targetType: "hifz_pages" as const,
          }
        : null,
    todayProgress,
  };
}

async function loadSafely<T>(
  label: string,
  loader: () => Promise<T>,
): Promise<T | null> {
  try {
    return await loader();
  } catch (error) {
    console.error(`Failed to load ${label}`, error);
    return null;
  }
}

export async function loadHomeDashboardSnapshotUncached(
  userId: string | null,
): Promise<HomeDashboardSnapshot> {
  if (!userId) {
    return {
      faham: null,
      hifz: null,
      read: null,
      tema: null,
      activity: null,
    };
  }

  const [faham, hifz, read, tema, activity] = await Promise.all([
    loadSafely("home faham snapshot", () => loadFahamSnapshot(userId)),
    loadSafely("home hifz snapshot", () => loadHifzSnapshot(userId)),
    loadSafely("home read snapshot", () => loadReadSnapshot(userId)),
    loadSafely("home tema snapshot", () => loadTemaSnapshot(userId)),
    loadSafely("home activity snapshot", () => loadActivitySnapshot(userId)),
  ]);

  return { faham, hifz, read, tema, activity };
}
