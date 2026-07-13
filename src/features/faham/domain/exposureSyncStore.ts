"use client";

import type { FahamExposureInput } from "./types";
import type {
  FahamExposureSignal,
  PendingFahamExposureEvent,
} from "./exposureSyncTypes";

const LS_KEY_PENDING_EXPOSURE = "miftah:faham:pending-exposure:v1";
const EXPOSURE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function getStorage(): Storage | null {
  if (typeof localStorage === "undefined") return null;
  try {
    return localStorage;
  } catch {
    return null;
  }
}

function parseJson(raw: string): unknown | null {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function isPositiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isPositiveIntArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.length > 0 && value.every(isPositiveInt);
}

export function isValidExposurePayload(value: unknown): value is FahamExposureInput {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  const { sourceType, ayahIds } = record;
  if (!isPositiveIntArray(ayahIds)) return false;

  if (sourceType === "reading_page") {
    const { pageNumber, surahId } = record;
    if (!isPositiveInt(pageNumber) || pageNumber > 604) return false;
    return surahId === undefined || surahId === null || (isPositiveInt(surahId) && surahId <= 114);
  }
  if (sourceType === "theme_chunk") {
    return isPositiveInt(record.surahId) && record.surahId <= 114 && isPositiveInt(record.themeChunkIndex);
  }
  if (sourceType === "hifz_ayah") {
    const { surahId } = record;
    return ayahIds.length === 1 && (surahId === undefined || surahId === null || (isPositiveInt(surahId) && surahId <= 114));
  }
  return false;
}

function isPositiveTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isNonNegativeInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function buildExposureIdentity(event: Pick<PendingFahamExposureEvent, "sourceKey" | "ayahKey">): string {
  return `${event.sourceKey}::${event.ayahKey}`;
}

function shouldDropStaleEvent(event: Pick<PendingFahamExposureEvent, "queuedAt">): boolean {
  return Date.now() - event.queuedAt > EXPOSURE_MAX_AGE_MS;
}

function parsePendingExposureEvent(raw: unknown): PendingFahamExposureEvent | null {
  if (typeof raw !== "object" || raw === null) return null;
  const record = raw as Record<string, unknown>;
  const { id, sourceKey, ayahKey, queuedAt, payload, retryCount, nextRetryAt, lastErrorAt } = record;
  if (typeof id !== "string" || typeof sourceKey !== "string" || typeof ayahKey !== "string" || !isPositiveTimestamp(queuedAt) || !isValidExposurePayload(payload)) return null;
  return {
    ayahKey,
    id,
    lastErrorAt: isPositiveTimestamp(lastErrorAt) ? lastErrorAt : null,
    nextRetryAt: isPositiveTimestamp(nextRetryAt) ? nextRetryAt : queuedAt,
    payload,
    queuedAt,
    retryCount: isNonNegativeInt(retryCount) ? retryCount : 0,
    sourceKey,
  };
}

function sanitizePendingExposureQueue(value: unknown): PendingFahamExposureEvent[] {
  if (!Array.isArray(value)) return [];
  const deduped = new Map<string, PendingFahamExposureEvent>();
  for (const raw of value) {
    const event = parsePendingExposureEvent(raw);
    if (!event || shouldDropStaleEvent(event)) continue;
    const identity = buildExposureIdentity(event);
    const existing = deduped.get(identity);
    const keepExisting = existing && existing.queuedAt <= event.queuedAt && existing.retryCount <= event.retryCount;
    if (!keepExisting) deduped.set(identity, event);
  }
  return Array.from(deduped.values()).sort((a, b) => a.nextRetryAt === b.nextRetryAt ? a.queuedAt - b.queuedAt : a.nextRetryAt - b.nextRetryAt);
}

function persistPendingExposureQueue(queue: PendingFahamExposureEvent[]): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(LS_KEY_PENDING_EXPOSURE, JSON.stringify(queue));
  } catch {
    // Ignore storage failures.
  }
}

export function loadPendingFahamExposureQueue(): PendingFahamExposureEvent[] {
  const storage = getStorage();
  if (!storage) return [];
  const raw = storage.getItem(LS_KEY_PENDING_EXPOSURE);
  if (!raw) return [];
  const parsed = parseJson(raw);
  const sanitized = sanitizePendingExposureQueue(parsed);
  if (sanitized.length === 0) {
    try {
      storage.removeItem(LS_KEY_PENDING_EXPOSURE);
    } catch {
      // Ignore storage failures.
    }
    return [];
  }
  if (sanitized.length !== (Array.isArray(parsed) ? parsed.length : 0)) persistPendingExposureQueue(sanitized);
  return sanitized;
}

export function loadFahamExposureSignals(limit = 24): FahamExposureSignal[] {
  return loadPendingFahamExposureQueue().slice(-Math.max(1, limit)).reverse().map((event) => {
    const payload = event.payload;
    if (payload.sourceType === "reading_page") return { ayahIds: payload.ayahIds, pageNumber: payload.pageNumber, queuedAt: event.queuedAt, sourceKey: event.sourceKey, sourceType: payload.sourceType, surahId: payload.surahId ?? null };
    if (payload.sourceType === "theme_chunk") return { ayahIds: payload.ayahIds, queuedAt: event.queuedAt, sourceKey: event.sourceKey, sourceType: payload.sourceType, surahId: payload.surahId, themeChunkIndex: payload.themeChunkIndex };
    return { ayahIds: payload.ayahIds, queuedAt: event.queuedAt, sourceKey: event.sourceKey, sourceType: payload.sourceType, surahId: payload.surahId ?? null };
  });
}

export function replacePendingFahamExposureQueue(queue: PendingFahamExposureEvent[]): PendingFahamExposureEvent[] {
  const sanitized = sanitizePendingExposureQueue(queue);
  persistPendingExposureQueue(sanitized);
  return sanitized;
}
