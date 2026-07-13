import { supabaseServer } from "@/data/supabase/server";
import type { HomeDashboardSnapshot } from "@/features/home";

export interface HomeFahamCounts {
  dueCount: number;
  encounteredWordCount: number;
  masteredWordCount: number;
  reviewedWordCount: number;
}

export interface HomeTemaCounts {
  completedCount: number;
  exploredSourceKeys: string[];
  totalChunks: number;
}

export interface HomeReadDashboardData {
  activityRows: Array<{ activityDate: string; metadata: unknown }>;
  readingState: { lastPage: number | null; lastReadAt: string | null } | null;
}

export interface HomeStoredDashboardSnapshot {
  dashboardSnapshot: unknown;
  snapshotComputedAt: string;
}

function isMissingRelation(error: { message?: string } | null): boolean {
  const message = String(error?.message ?? "").toLowerCase();
  return (
    message.includes("does not exist") ||
    message.includes('relation "') ||
    message.includes("relation '")
  );
}

export async function getHomeFahamCounts(
  userId: string,
  focusWordIds: number[],
  now: string,
): Promise<HomeFahamCounts> {
  const [dueCountResult, progressResult, encounteredCountResult, masteredCountResult] =
    await Promise.all([
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

  if (dueCountResult.error) throw dueCountResult.error;
  if (progressResult.error) throw progressResult.error;
  if (encounteredCountResult.error) throw encounteredCountResult.error;
  if (masteredCountResult.error) throw masteredCountResult.error;

  return {
    dueCount: dueCountResult.count ?? 0,
    encounteredWordCount: encounteredCountResult.count ?? 0,
    masteredWordCount: masteredCountResult.count ?? 0,
    reviewedWordCount: progressResult.count ?? 0,
  };
}

export async function getHomeTemaCounts(userId: string): Promise<HomeTemaCounts> {
  const [totalChunksResult, exposuresResult, completedResult] = await Promise.all([
    supabaseServer.from("ayah_theme_chunks").select("id", { count: "exact", head: true }),
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

  if (totalChunksResult.error && !isMissingRelation(totalChunksResult.error)) throw totalChunksResult.error;
  if (exposuresResult.error && !isMissingRelation(exposuresResult.error)) throw exposuresResult.error;
  if (completedResult.error && !isMissingRelation(completedResult.error)) throw completedResult.error;

  return {
    completedCount: completedResult.error ? 0 : completedResult.count ?? 0,
    exploredSourceKeys: (exposuresResult.data ?? [])
      .map((row) => row.source_key)
      .filter((value): value is string => typeof value === "string" && value.length > 0),
    totalChunks: totalChunksResult.error ? 0 : totalChunksResult.count ?? 0,
  };
}

export async function getHomeReadDashboardData(userId: string): Promise<HomeReadDashboardData> {
  const [readingStateResult, readActivityResult] = await Promise.all([
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
  ]);

  if (readingStateResult.error && readingStateResult.error.code !== "PGRST116") {
    throw readingStateResult.error;
  }
  if (readActivityResult.error) throw readActivityResult.error;

  return {
    activityRows: (readActivityResult.data ?? []).map((row) => ({
      activityDate: row.activity_date,
      metadata: row.metadata,
    })),
    readingState: readingStateResult.data
      ? {
          lastPage: readingStateResult.data.last_page,
          lastReadAt: readingStateResult.data.last_read_at,
        }
      : null,
  };
}

export async function getHomeStoredDashboardSnapshot(
  userId: string,
): Promise<HomeStoredDashboardSnapshot | null> {
  const { data, error } = await supabaseServer
    .from("profiles")
    .select("dashboard_snapshot, snapshot_computed_at")
    .eq("id", userId)
    .single();

  if (error) throw error;
  if (!data?.dashboard_snapshot || !data.snapshot_computed_at) return null;

  return {
    dashboardSnapshot: data.dashboard_snapshot,
    snapshotComputedAt: data.snapshot_computed_at,
  };
}

export async function storeHomeDashboardSnapshot(
  userId: string,
  snapshot: HomeDashboardSnapshot,
  computedAt: string,
): Promise<void> {
  const { error } = await supabaseServer
    .from("profiles")
    .update({ dashboard_snapshot: snapshot, snapshot_computed_at: computedAt })
    .eq("id", userId);

  if (error) throw error;
}

export async function migrateLegacyHifzDailyGoal(
  userId: string,
  nextCount: number,
  updatedAt: string,
): Promise<void> {
  const { error } = await supabaseServer
    .from("profiles")
    .update({
      daily_goal_count: nextCount,
      daily_goal_type: "hifz_pages",
      updated_at: updatedAt,
    })
    .eq("id", userId);

  if (error) throw error;
}
