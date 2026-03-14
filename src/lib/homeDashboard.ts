import { TOP_FAHAM_WORD_LIMIT } from "@/lib/faham/config";
import { buildFahamQueuePlan, DEFAULT_FAHAM_ENGINE_CONFIG } from "@/lib/faham/engine";
import { buildFahamLevelProgress, getFahamLevelState, type FahamLevelProgress } from "@/lib/faham/levels";
import {
  getDueFahamCards,
  getFahamExposureCandidates,
  getTopFahamWordIds,
} from "@/lib/faham/repository";
import { buildDailyPlanWithDetails } from "@/lib/hifz/scheduler";
import { hasAnyHifzProgress } from "@/lib/hifz/study-progress";
import { getHifzStats } from "@/lib/hifz/stats";
import { supabaseServer } from "@/lib/supabase-server";
import { getReadPageActivityRows } from "@/lib/activityEvents";
import {
  getUserStreak,
  getUserDailyGoal,
  getDailyActivityCount,
  recommendHifzPageGoalFromAyahGoal,
} from "@/lib/activity";
import type { ActivityType, DailyGoalType } from "@/lib/activity";
import type { PlanItem } from "@/lib/hifz/scheduler";

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
  const [dueCards, candidates, dueCountResult, progressResult, encounteredCountResult, masteredCountResult] = await Promise.all([
    getDueFahamCards(
      userId,
      Math.max(config.dueLimit, config.pauseNewCardsAboveDueCount),
      levelProgress.activeWordLimit,
    ),
    getFahamExposureCandidates(userId, config.candidatePoolSize, levelProgress.activeWordLimit),
    supabaseServer
      .from("vocab_progress")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .in("word_id", focusWordIds)
      .lte("due", now),
    supabaseServer
      .from("vocab_progress")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .in("word_id", focusWordIds),
    supabaseServer
      .from("v_vocab_exposure_summary")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .in("word_id", focusWordIds),
    supabaseServer
      .from("vocab_progress")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .in("word_id", focusWordIds)
      .eq("is_mastered", true),
  ]);

  if (dueCountResult.error) {
    throw dueCountResult.error;
  }
  if (progressResult.error) {
    throw progressResult.error;
  }
  if (encounteredCountResult.error) {
    throw encounteredCountResult.error;
  }
  if (masteredCountResult.error) {
    throw masteredCountResult.error;
  }
  const plan = buildFahamQueuePlan({
    candidates,
    config,
    dueCards,
    masteredCards: [],
  });
  const dueCount = dueCountResult.count ?? 0;
  const encounteredWordCount = encounteredCountResult.count ?? 0;
  const masteredWordCount = masteredCountResult.count ?? 0;
  const reviewedWordCount = progressResult.count ?? 0;
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

function isMissingRelation(error: { message?: string } | null): boolean {
  const message = String(error?.message ?? "").toLowerCase();
  return (
    message.includes("does not exist") ||
    message.includes('relation "') ||
    message.includes("relation '")
  );
}

async function loadTemaSnapshot(userId: string): Promise<HomeTemaSnapshot> {
  const [totalChunksResult, exposuresResult, completedResult] = await Promise.all([
    supabaseServer
      .from("ayah_theme_chunks")
      .select("id", { count: "exact", head: true }),
    supabaseServer
      .from("vocab_exposure_events")
      .select("source_key")
      .eq("user_id", userId)
      .eq("source_type", "theme_chunk"),
    supabaseServer
      .from("theme_chunk_progress")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "completed"),
  ]);

  if (totalChunksResult.error && !isMissingRelation(totalChunksResult.error)) {
    throw totalChunksResult.error;
  }
  if (exposuresResult.error && !isMissingRelation(exposuresResult.error)) {
    throw exposuresResult.error;
  }
  if (completedResult.error && !isMissingRelation(completedResult.error)) {
    throw completedResult.error;
  }

  const sourceKeys = new Set(
    ((exposuresResult.data ?? []) as Array<{ source_key: string | null }>)
      .map((row) => row.source_key)
      .filter((value): value is string => typeof value === "string" && value.length > 0),
  );
  const totalChunks =
    totalChunksResult.error && isMissingRelation(totalChunksResult.error)
      ? 0
      : totalChunksResult.count ?? 0;
  const exploredCount = sourceKeys.size;
  const completedCount =
    completedResult.error && isMissingRelation(completedResult.error)
      ? 0
      : completedResult.count ?? 0;

  return {
    completedCount,
    completedPct: percentage(completedCount, totalChunks),
    exploredCount,
    exploredPct: percentage(exploredCount, totalChunks),
    totalChunks,
  };
}

async function loadReadSnapshot(userId: string): Promise<HomeReadSnapshot> {
  const [readingStateResult, readActivityResult, readEventRows] = await Promise.all([
    supabaseServer
      .from("user_reading_state")
      .select("last_page, last_read_at")
      .eq("user_id", userId)
      .maybeSingle(),
    supabaseServer
      .from("user_activity_log")
      .select("activity_date, metadata")
      .eq("user_id", userId)
      .eq("activity_type", "read"),
    getReadPageActivityRows(userId),
  ]);

  if (readingStateResult.error && readingStateResult.error.code !== "PGRST116") {
    throw readingStateResult.error;
  }
  if (readActivityResult.error) {
    throw readActivityResult.error;
  }

  const uniquePagesLifetime = new Set<number>();
  const uniquePages7d = new Set<number>();
  const cutoffKey = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const rows = (readActivityResult.data ?? []) as Array<{
    activity_date: string;
    metadata: unknown;
  }>;
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
      if (row.activity_date >= cutoffKey) {
        uniquePages7d.add(page);
      }
    }
  }

  return {
    lastPage: readingStateResult.data?.last_page ?? null,
    lastReadAt: readingStateResult.data?.last_read_at ?? null,
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

export async function loadHomeDashboardSnapshot(
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
