import { supabaseServer } from "@/lib/supabase-server";
import {
  getActivityEventDateKeys,
  getDailyActivityEventSummary,
  getDailyHifzAyahCountFromEvents,
  getDailyHifzPageCountFromEvents,
  getLegacyActivityDateKeys,
  todayActivityDateKey,
} from "@/lib/activityEvents";

export type ActivityType = "read" | "faham" | "hifz" | "theme";
export type DailyGoalType =
  | "faham_words"
  | "read_pages"
  | "hifz_ayat"
  | "hifz_pages"
  | "theme_chunks";
type ActivityMetadata = {
  ayahId?: number;
  ayat?: number[];
  page?: number;
  pages?: number[];
  [key: string]: unknown;
};

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const AVERAGE_AYAT_PER_PAGE = 6236 / 604;

function toDateKey(value: string): string {
  return value.slice(0, 10);
}

function dateDiffDays(newerDateKey: string, olderDateKey: string): number {
  const newer = new Date(`${newerDateKey}T00:00:00.000Z`).getTime();
  const older = new Date(`${olderDateKey}T00:00:00.000Z`).getTime();
  return Math.round((newer - older) / DAY_IN_MS);
}

function buildStreakFromDateKeys(dateKeys: string[]): {
  current_streak: number;
  longest_streak: number;
  last_activity_date: string | null;
} {
  if (dateKeys.length === 0) {
    return { current_streak: 0, longest_streak: 0, last_activity_date: null };
  }

  const sorted = [...new Set(dateKeys)].sort((left, right) => right.localeCompare(left));
  let currentStreak = 1;
  for (let index = 1; index < sorted.length; index += 1) {
    if (dateDiffDays(sorted[index - 1], sorted[index]) === 1) {
      currentStreak += 1;
      continue;
    }
    break;
  }

  let longestStreak = 1;
  let run = 1;
  for (let index = 1; index < sorted.length; index += 1) {
    if (dateDiffDays(sorted[index - 1], sorted[index]) === 1) {
      run += 1;
      longestStreak = Math.max(longestStreak, run);
    } else {
      run = 1;
    }
  }

  return {
    current_streak: currentStreak,
    longest_streak: longestStreak,
    last_activity_date: sorted[0] ?? null,
  };
}

async function deriveStreakFallback(userId: string) {
  const [eventDateKeys, activityDateKeys] = await Promise.all([
    getActivityEventDateKeys(userId).catch((error: unknown) => {
      console.error("[deriveStreakFallback] Error loading activity events:", error);
      return [] as string[];
    }),
    getLegacyActivityDateKeys(userId).catch((error: unknown) => {
      console.error("[deriveStreakFallback] Error loading activity log:", error);
      return [] as string[];
    }),
  ]);

  const combinedActivityDateKeys = [...eventDateKeys, ...activityDateKeys];
  if (combinedActivityDateKeys.length > 0) {
    return buildStreakFromDateKeys(combinedActivityDateKeys);
  }

  const dedupedActivityDateKeys = Array.from(new Set(activityDateKeys));
  if (activityDateKeys.length > 0) {
    return buildStreakFromDateKeys(dedupedActivityDateKeys);
  }

  // Backward-compatible fallback for users with legacy reviews before activity log existed.
  const { data: vocabRows, error: vocabError } = await supabaseServer
    .from("vocab_progress")
    .select("last_review")
    .eq("user_id", userId)
    .not("last_review", "is", null)
    .order("last_review", { ascending: false })
    .limit(5000);

  if (vocabError) {
    console.error("[deriveStreakFallback] Error loading vocab reviews:", vocabError);
    return { current_streak: 0, longest_streak: 0, last_activity_date: null };
  }

  const reviewDateKeys = ((vocabRows ?? []) as Array<{ last_review: string | null }>)
    .map((row) => row.last_review)
    .filter((value): value is string => typeof value === "string" && value.length >= 10)
    .map(toDateKey);

  return buildStreakFromDateKeys(reviewDateKeys);
}

export async function logUserActivity(
  userId: string,
  type: ActivityType,
  metadata: ActivityMetadata = {},
) {
  // We want to track unique entities (pages, ayat) per day in a single row
  // metadata usually contains { page: N } or { ayahId: N }
  
  const today = new Date().toISOString().split("T")[0];

  // First, try to get existing log for today
  const { data: existing } = await supabaseServer
    .from("user_activity_log")
    .select("metadata")
    .eq("user_id", userId)
    .eq("activity_date", today)
    .eq("activity_type", type)
    .single();

  let finalMetadata = { ...metadata };
  
  if (existing?.metadata) {
    const prev = (existing.metadata ?? {}) as ActivityMetadata;
    
    // If we are tracking pages or ayat, we want to keep a unique list
    if (metadata.page && type === "read") {
      const pages = new Set(
        Array.isArray(prev.pages)
          ? prev.pages.filter((value): value is number => typeof value === "number")
          : [],
      );
      pages.add(metadata.page);
      finalMetadata = { pages: Array.from(pages) };
    } else if (metadata.ayahId && type === "hifz") {
      const ayat = new Set(
        Array.isArray(prev.ayat)
          ? prev.ayat.filter((value): value is number => typeof value === "number")
          : [],
      );
      ayat.add(metadata.ayahId);
      finalMetadata = { ayat: Array.from(ayat) };
    } else {
      finalMetadata = { ...prev, ...metadata };
    }
  } else {
    // New log for today
    if (metadata.page && type === "read") {
      finalMetadata = { pages: [metadata.page] };
    } else if (metadata.ayahId && type === "hifz") {
      finalMetadata = { ayat: [metadata.ayahId] };
    }
  }

  const { error } = await supabaseServer
    .from("user_activity_log")
    .upsert(
      {
        user_id: userId,
        activity_date: today,
        activity_type: type,
        metadata: finalMetadata,
      },
      { onConflict: "user_id,activity_date,activity_type" },
    );

  if (error) {
    console.error(`[logUserActivity] Failed to log ${type}:`, error);
  }
}

export async function getUserStreak(userId: string) {
  return deriveStreakFallback(userId);
}

export async function getUserDailyGoal(
  userId: string,
): Promise<{ count: number; type: DailyGoalType }> {
  const { data, error } = await supabaseServer
    .from("profiles")
    .select("daily_goal_count, daily_goal_type")
    .eq("id", userId)
    .single();

  if (error) {
    console.error("[getUserDailyGoal] Error:", error);
    return { count: 10, type: "faham_words" };
  }

  return {
    count: data.daily_goal_count || 10,
    type: (data.daily_goal_type || "faham_words") as DailyGoalType,
  };
}

export function recommendHifzPageGoalFromAyahGoal(ayahGoal: number): number {
  if (!Number.isFinite(ayahGoal) || ayahGoal <= 0) {
    return 1;
  }

  return Math.max(1, Math.round(ayahGoal / AVERAGE_AYAT_PER_PAGE));
}

interface DailyActivityCountOptions {
  hifzUnit?: "ayah" | "page";
}

async function getDailyHifzAyahCount(
  userId: string,
  today: string,
  eventSummaryAyahCount: number,
): Promise<number> {
  const eventAyahCount = await getDailyHifzAyahCountFromEvents(userId, today).catch(
    (error: unknown) => {
      console.error("[getDailyActivityCount] Error loading hifz ayah count:", error);
      return eventSummaryAyahCount;
    },
  );

  const { data, error } = await supabaseServer
    .from("review_log")
    .select("item_id")
    .eq("user_id", userId)
    .eq("review_type", "ayah")
    .gte("reviewed_at", today);

  if (error) {
    console.error("[getDailyActivityCount] Error counting hifz ayat:", error);
    return Math.max(eventSummaryAyahCount, eventAyahCount);
  }

  const reviewAyahCount = new Set(
    ((data ?? []) as Array<{ item_id: number | null }>)
      .map((row) => row.item_id)
      .filter((value): value is number => typeof value === "number"),
  ).size;

  return Math.max(eventSummaryAyahCount, eventAyahCount, reviewAyahCount);
}

async function getDailyHifzPageCount(
  userId: string,
  today: string,
): Promise<number> {
  const eventPageCount = await getDailyHifzPageCountFromEvents(userId, today).catch(
    (error: unknown) => {
      console.error("[getDailyActivityCount] Error loading hifz page count:", error);
      return 0;
    },
  );

  const { data, error } = await supabaseServer
    .from("review_log")
    .select("ayat!inner(page_number)")
    .eq("user_id", userId)
    .eq("review_type", "ayah")
    .gte("reviewed_at", today);

  if (error) {
    console.error("[getDailyActivityCount] Error counting hifz pages:", error);
    return eventPageCount;
  }

  const reviewPageCount = new Set(
    ((data ?? []) as Array<{ ayat: unknown }>)
      .map((row) => {
        const ayat = row.ayat;
        if (Array.isArray(ayat)) {
          const first = ayat[0];
          return typeof first?.page_number === "number" ? first.page_number : null;
        }
        if (typeof ayat !== "object" || ayat === null) {
          return null;
        }
        const pageNumber = Reflect.get(ayat, "page_number");
        return typeof pageNumber === "number" ? pageNumber : null;
      })
      .filter((value): value is number => typeof value === "number"),
  ).size;

  return Math.max(eventPageCount, reviewPageCount);
}

export async function getDailyActivityCount(
  userId: string,
  type: ActivityType,
  options?: DailyActivityCountOptions,
) {
  const today = todayActivityDateKey();
  const eventSummary = await getDailyActivityEventSummary(userId, today).catch(
    (error: unknown) => {
      console.error("[getDailyActivityCount] Error loading event summary:", error);
      return null;
    },
  );

  if (type === "faham") {
    const { count, error } = await supabaseServer
      .from("vocab_progress")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("last_review", today);

    if (error) {
      console.error("[getDailyActivityCount] Error counting faham:", error);
      return eventSummary?.fahamWordsCount ?? 0;
    }

    return Math.max(eventSummary?.fahamWordsCount ?? 0, count || 0);
  }

  if (type === "read" && eventSummary) {
    return eventSummary.readPagesCount;
  }
  if (type === "hifz") {
    if (options?.hifzUnit === "ayah") {
      return getDailyHifzAyahCount(userId, today, eventSummary?.hifzAyatCount ?? 0);
    }

    return getDailyHifzPageCount(userId, today);
  }
  if (type === "theme" && eventSummary) {
    return eventSummary.themeChunksCount;
  }

  const { data: todayData } = await supabaseServer
    .from("user_activity_log")
    .select("metadata")
    .eq("user_id", userId)
    .eq("activity_date", today)
    .eq("activity_type", type)
    .single();

  if (todayData?.metadata) {
    const meta = (todayData.metadata ?? {}) as ActivityMetadata;
    if (type === "read" && Array.isArray(meta.pages)) {
      return meta.pages.length;
    }
  }

  // Fallback to basic row count if metadata tracking isn't used for this type
  const { count } = await supabaseServer
    .from("user_activity_log")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("activity_date", today)
    .eq("activity_type", type);
    
  return count || 0;
}
