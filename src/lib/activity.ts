import { supabaseServer } from "@/lib/supabase-server";

export type ActivityType = "read" | "faham" | "hifz" | "theme";

export async function logUserActivity(
  userId: string,
  type: ActivityType,
  metadata: Record<string, any> = {},
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
    const prev = existing.metadata as Record<string, any>;
    
    // If we are tracking pages or ayat, we want to keep a unique list
    if (metadata.page && type === "read") {
      const pages = new Set(prev.pages || []);
      pages.add(metadata.page);
      finalMetadata = { pages: Array.from(pages) };
    } else if (metadata.ayahId && type === "hifz") {
      const ayat = new Set(prev.ayat || []);
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

  return data || { current_streak: 0, longest_streak: 0, last_activity_date: null };
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
    const meta = todayData.metadata as any;
    if (type === "read" && meta.pages) {
      return meta.pages.length;
    }
    if (type === "hifz" && meta.ayat) {
      return meta.ayat.length;
    }
  }

  // Fallback to basic row count if metadata tracking isn't used for this type
  const { count, error } = await supabaseServer
    .from("user_activity_log")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("activity_date", today)
    .eq("activity_type", type);
    
  return count || 0;
}
