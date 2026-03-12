import { TOP_FAHAM_WORD_LIMIT } from "@/lib/faham/config";
import { buildFahamQueuePlan, DEFAULT_FAHAM_ENGINE_CONFIG } from "@/lib/faham/engine";
import {
  getDueFahamCards,
  getFahamExposureCandidates,
  getTopFahamWordCount,
  getTopFahamWordIds,
} from "@/lib/faham/repository";
import { buildDailyPlanWithDetails } from "@/lib/hifz/scheduler";
import { getHifzStats } from "@/lib/hifz/stats";
import { supabaseServer } from "@/lib/supabase-server";
import { getUserStreak, getUserDailyGoal, getDailyActivityCount } from "@/lib/activity";

const TOTAL_QURAN_AYAT = 6236;

export interface HomeFahamSnapshot {
  blockedReason: "due_backlog" | null;
  coveragePct: number;
  dueCount: number;
  eligibleNewCount: number;
  focusWordLimit: number;
  reviewedWordCount: number;
  totalCandidateCount: number;
  totalWords: number;
}

export interface HomeHifzSnapshot {
  dueTodayCount: number;
  manzilCoveragePct: number;
  nextAyahLabel: string | null;
  streak: number;
  todayTotal: number;
  totalManzil: number;
}

export interface HomeTemaSnapshot {
  exploredCount: number;
  exploredPct: number;
  totalChunks: number;
}

export interface HomeDashboardSnapshot {
  faham: HomeFahamSnapshot | null;
  hifz: HomeHifzSnapshot | null;
  tema: HomeTemaSnapshot | null;
  activity: {
    streak: number;
    dailyGoalCount: number;
    dailyGoalType: string;
    todayProgress: number;
  } | null;
}

function percentage(value: number, total: number): number {
  if (total <= 0) {
    return 0;
  }

  return Math.min(100, Math.round((value / total) * 100));
}

function nextAyahLabel(
  plan: Awaited<ReturnType<typeof buildDailyPlanWithDetails>>,
): string | null {
  const nextItem = plan.sabqi[0] ?? plan.sabak[0] ?? plan.manzil[0];
  if (!nextItem) {
    return null;
  }

  return `${nextItem.ayah.surahId}:${nextItem.ayah.ayahNumber} ${nextItem.ayah.surahNameTranslit}`;
}

async function loadHifzSnapshot(userId: string): Promise<HomeHifzSnapshot> {
  const [plan, stats] = await Promise.all([
    buildDailyPlanWithDetails(userId),
    getHifzStats(userId),
  ]);

  return {
    dueTodayCount: stats.dueTodayCount,
    manzilCoveragePct: percentage(stats.totalManzil, TOTAL_QURAN_AYAT),
    nextAyahLabel: nextAyahLabel(plan),
    streak: stats.streak,
    todayTotal: plan.sabqi.length + plan.sabak.length + plan.manzil.length,
    totalManzil: stats.totalManzil,
  };
}

async function loadFahamSnapshot(userId: string): Promise<HomeFahamSnapshot> {
  const config = DEFAULT_FAHAM_ENGINE_CONFIG;
  const now = new Date().toISOString();
  const topWordIds = await getTopFahamWordIds();
  if (topWordIds.length === 0) {
    return {
      blockedReason: null,
      coveragePct: 0,
      dueCount: 0,
      eligibleNewCount: 0,
      focusWordLimit: TOP_FAHAM_WORD_LIMIT,
      reviewedWordCount: 0,
      totalCandidateCount: 0,
      totalWords: 0,
    };
  }

  const [dueCards, candidates, topWordCount, dueCountResult, progressResult] = await Promise.all([
    getDueFahamCards(
      userId,
      Math.max(config.dueLimit, config.pauseNewCardsAboveDueCount),
    ),
    getFahamExposureCandidates(userId, config.candidatePoolSize),
    getTopFahamWordCount(),
    supabaseServer
      .from("vocab_progress")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .in("word_id", topWordIds)
      .lte("due", now),
    supabaseServer
      .from("vocab_progress")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .in("word_id", topWordIds),
  ]);

  if (dueCountResult.error) {
    throw dueCountResult.error;
  }
  if (progressResult.error) {
    throw progressResult.error;
  }
  const plan = buildFahamQueuePlan({
    candidates,
    config,
    dueCards,
    masteredCards: [],
  });
  const dueCount = dueCountResult.count ?? 0;
  const reviewedWordCount = progressResult.count ?? 0;
  const totalWords = topWordCount;

  return {
    blockedReason: plan.blockedReason,
    coveragePct: percentage(reviewedWordCount, totalWords),
    dueCount,
    eligibleNewCount: plan.stats.eligibleNewCount,
    focusWordLimit: TOP_FAHAM_WORD_LIMIT,
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
  const [totalChunksResult, exposuresResult] = await Promise.all([
    supabaseServer
      .from("ayah_theme_chunks")
      .select("id", { count: "exact", head: true }),
    supabaseServer
      .from("vocab_exposure_events")
      .select("source_key")
      .eq("user_id", userId)
      .eq("source_type", "theme_chunk"),
  ]);

  if (totalChunksResult.error && !isMissingRelation(totalChunksResult.error)) {
    throw totalChunksResult.error;
  }
  if (exposuresResult.error && !isMissingRelation(exposuresResult.error)) {
    throw exposuresResult.error;
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

  return {
    exploredCount,
    exploredPct: percentage(exploredCount, totalChunks),
    totalChunks,
  };
}

async function loadActivitySnapshot(userId: string) {
  const [streak, goal, todayProgress] = await Promise.all([
    getUserStreak(userId),
    getUserDailyGoal(userId),
    // We need to know which type to count based on the goal
  ]).then(async ([streak, goal]) => {
    const progress = await getDailyActivityCount(userId, goal.type.split('_')[0] as any);
    return [streak, goal, progress] as const;
  });

  return {
    streak: streak?.current_streak ?? 0,
    dailyGoalCount: goal.count,
    dailyGoalType: goal.type,
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
      tema: null,
      activity: null,
    };
  }

  const [faham, hifz, tema, activity] = await Promise.all([
    loadSafely("home faham snapshot", () => loadFahamSnapshot(userId)),
    loadSafely("home hifz snapshot", () => loadHifzSnapshot(userId)),
    loadSafely("home tema snapshot", () => loadTemaSnapshot(userId)),
    loadSafely("home activity snapshot", () => loadActivitySnapshot(userId)),
  ]);

  return { faham, hifz, tema, activity };
}
