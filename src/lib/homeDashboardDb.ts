import {
  hasHomeDashboardData,
  sanitizeHomeDashboardSnapshot,
} from "@/lib/homeDashboardStorage";
import { supabaseServer } from "@/lib/supabase-server";
import type { HomeDashboardSnapshot } from "@/lib/homeDashboard";

const SNAPSHOT_STALE_MS = 5 * 60 * 1000;

/**
 * Read precomputed dashboard snapshot from profiles table.
 * Returns null if missing, stale (>5min), or corrupt.
 */
export async function readSnapshotFromDb(
  userId: string,
): Promise<HomeDashboardSnapshot | null> {
  try {
    const { data, error } = await supabaseServer
      .from("profiles")
      .select("dashboard_snapshot, snapshot_computed_at")
      .eq("id", userId)
      .single();

    if (error || !data?.dashboard_snapshot || !data.snapshot_computed_at) {
      return null;
    }

    const computedAt = new Date(data.snapshot_computed_at).getTime();
    if (Date.now() - computedAt > SNAPSHOT_STALE_MS) {
      return null;
    }

    const snapshot = sanitizeHomeDashboardSnapshot(data.dashboard_snapshot);
    return hasHomeDashboardData(snapshot) ? snapshot : null;
  } catch {
    return null;
  }
}

/**
 * Compute fresh dashboard snapshot and write to profiles table.
 * Meant to be called inside after() — never throws.
 */
export async function recomputeAndStoreSnapshot(
  userId: string,
): Promise<void> {
  try {
    const { loadHomeDashboardSnapshotUncached } = await import(
      "@/lib/homeDashboard"
    );
    const snapshot = await loadHomeDashboardSnapshotUncached(userId);

    await supabaseServer
      .from("profiles")
      .update({
        dashboard_snapshot: snapshot,
        snapshot_computed_at: new Date().toISOString(),
      })
      .eq("id", userId);
  } catch (error) {
    console.error("[homeDashboardDb] recompute failed:", error);
  }
}

/**
 * Composite loader: try DB snapshot first, fall back to cached live computation.
 */
export async function loadDashboardWithDbCache(
  userId: string | null,
): Promise<HomeDashboardSnapshot> {
  const { loadHomeDashboardSnapshot } = await import("@/lib/homeDashboard");

  if (!userId) {
    return loadHomeDashboardSnapshot(userId);
  }

  const dbSnapshot = await readSnapshotFromDb(userId);
  if (dbSnapshot) {
    return dbSnapshot;
  }

  return loadHomeDashboardSnapshot(userId);
}
