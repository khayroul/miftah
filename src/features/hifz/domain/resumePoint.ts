/**
 * Persists the user's last hifz session position so they can resume
 * with a single tap from the dashboard. Expires after 24 hours.
 */

import type { HifzFlowType } from "./sessionQueue";

export interface HifzResumePoint {
  flow: HifzFlowType;
  pageNumber: number;
  queueIndex: number;
  chunkIndex?: number;
  step?: number;
  savedAt: number;
}

const STORAGE_KEY = "miftah:hifz:resume";
const EXPIRY_MS = 24 * 60 * 60 * 1000;

function getLocalStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function saveResumePoint(point: Omit<HifzResumePoint, "savedAt">): void {
  const storage = getLocalStorage();
  if (!storage) return;
  try {
    const data: HifzResumePoint = { ...point, savedAt: Date.now() };
    storage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // ignore quota errors
  }
}

export function getResumePoint(): HifzResumePoint | null {
  const storage = getLocalStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const point = JSON.parse(raw) as HifzResumePoint;
    if (Date.now() - point.savedAt > EXPIRY_MS) {
      storage.removeItem(STORAGE_KEY);
      return null;
    }
    return point;
  } catch {
    return null;
  }
}

export function clearResumePoint(): void {
  const storage = getLocalStorage();
  if (!storage) return;
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
