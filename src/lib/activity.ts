import { supabaseServer } from "@/lib/supabase-server";

export type ActivityType = "read" | "faham" | "hifz" | "theme";
type ActivityMetadata = {
  ayahId?: number;
  ayat?: number[];
  page?: number;
  pages?: number[];
  [key: string]: unknown;
};

const DAY_IN_MS = 24 * 60 * 60 * 1000;

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
  const { data: activityRows, error: activityError } = await supabaseServer
    .from("user_activity_log")
    .select("activity_date")
    .eq("user_id", userId)
    .order("activity_date", { ascending: false })
    .limit(3650);

  if (activityError) {
    console.error("[deriveStreakFallback] Error loading activity log:", activityError);
    return { current_streak: 0, longest_streak: 0, last_activity_date: null };
  }

  const activityDateKeys = ((activityRows ?? []) as Array<{ activity_date: string }>)
    .map((row) => row.activity_date)
    .filter((value) => typeof value === "string" && value.length >= 10);
  if (activityDateKeys.length > 0) {
    return buildStreakFromDateKeys(activityDateKeys);
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
  const { data, error } = await supabaseServer
    .from("user_streaks")
    .select("current_streak, longest_streak, last_activity_date")
    .eq("user_id", userId)
    .single();

  if (error && error.code !== "PGRST116") {
    console.error("[getUserStreak] Error:", error);
    return null;
  }

  if (data) {
    return data;
  }

  return deriveStreakFallback(userId);
}

export async function getUserDailyGoal(userId: string) {
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
    type: data.daily_goal_type || "faham_words",
  };
}

export async function getDailyActivityCount(userId: string, type: ActivityType) {
  const today = new Date().toISOString().split("T")[0];
  
  if (type === "faham") {
    // For faham, we actually want to count how many unique words were reviewed today
    const { count, error } = await supabaseServer
      .from("vocab_progress")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("last_review", today);
      
    if (error) {
      console.error("[getDailyActivityCount] Error counting faham:", error);
      return 0;
    }
    return count || 0;
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
    if (type === "hifz" && Array.isArray(meta.ayat)) {
      return meta.ayat.length;
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
