import type { HomeDashboardSnapshot } from "./homeDashboard";
import { sanitizeHomeDashboardSnapshot } from "./homeDashboardSnapshotValidation";

export {
  emptyHomeDashboardSnapshot,
  hasHomeDashboardData,
  sanitizeHomeDashboardSnapshot,
} from "./homeDashboardSnapshotValidation";

const STORAGE_KEY_PREFIX = "miftah.home.dashboard.v1";

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
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
