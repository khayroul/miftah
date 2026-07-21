import { unstable_cache } from "next/cache";
import { DEFAULT_LOCALE, type AppLocale } from "@/i18n/request";
import {
  getHomeStoredDashboardSnapshot,
  storeHomeDashboardSnapshot,
} from "@/data/repositories/home";
import {
  hasHomeDashboardData,
  sanitizeHomeDashboardSnapshot,
} from "./domain/homeDashboardStorage";
import type { HomeDashboardSnapshot } from "./domain/homeDashboard";

const SNAPSHOT_STALE_MS = 5 * 60 * 1000;

function hasLegacyFahamCoveragePct(raw: unknown): boolean {
  if (typeof raw !== "object" || raw === null || !("faham" in raw)) {
    return false;
  }

  const faham = raw.faham;
  return (
    typeof faham === "object" &&
    faham !== null &&
    Object.prototype.hasOwnProperty.call(faham, "coveragePct")
  );
}

async function loadHomeDashboardSnapshotUncached(
  userId: string | null,
  locale: AppLocale,
): Promise<HomeDashboardSnapshot> {
  const dashboard = await import("./domain/homeDashboard");
  return dashboard.loadHomeDashboardSnapshotUncached(userId, locale);
}

/**
 * Read precomputed dashboard snapshot from profiles table.
 * Returns null if missing, stale (>5min), or corrupt.
 */
export async function readSnapshotFromDb(
  userId: string,
): Promise<HomeDashboardSnapshot | null> {
  try {
    const storedSnapshot = await getHomeStoredDashboardSnapshot(userId);
    if (!storedSnapshot) {
      return null;
    }

    const computedAt = new Date(storedSnapshot.snapshotComputedAt).getTime();
    if (Date.now() - computedAt > SNAPSHOT_STALE_MS) {
      return null;
    }

    const snapshot = sanitizeHomeDashboardSnapshot(storedSnapshot.dashboardSnapshot);
    if (!hasHomeDashboardData(snapshot)) {
      return null;
    }

    if (hasLegacyFahamCoveragePct(storedSnapshot.dashboardSnapshot)) {
      try {
        await storeHomeDashboardSnapshot(
          userId,
          snapshot,
          storedSnapshot.snapshotComputedAt,
        );
      } catch (error) {
        console.error("[homeDashboardDb] legacy snapshot migration failed:", error);
      }
    }

    return snapshot;
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
  locale: AppLocale = DEFAULT_LOCALE,
): Promise<void> {
  try {
    const snapshot = await loadHomeDashboardSnapshotUncached(userId, locale);
    await storeHomeDashboardSnapshot(userId, snapshot, new Date().toISOString());
  } catch (error) {
    console.error("[homeDashboardDb] recompute failed:", error);
  }
}

/**
 * Composite loader: try DB snapshot first, fall back to cached live computation.
 */
export async function loadDashboardWithDbCache(
  userId: string | null,
  locale: AppLocale = DEFAULT_LOCALE,
): Promise<HomeDashboardSnapshot> {
  if (!userId) {
    return loadHomeDashboardSnapshot(userId, locale);
  }

  const dbSnapshot = await readSnapshotFromDb(userId);
  if (dbSnapshot) {
    return dbSnapshot;
  }

  return loadHomeDashboardSnapshot(userId, locale);
}

export const loadHomeDashboardSnapshot = unstable_cache(
  loadHomeDashboardSnapshotUncached,
  ["home-dashboard-snapshot"],
  { revalidate: 30, tags: ["home-dashboard"] },
);
