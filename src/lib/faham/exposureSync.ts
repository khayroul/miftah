"use client";

import { buildFahamSourceKey } from "./source-key";
import type { FahamExposureInput } from "./types";

const LS_KEY_PENDING_EXPOSURE = "miftah:faham:pending-exposure:v1";
const EXPOSURE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const EXPOSURE_MAX_RETRY_COUNT = 6;
const EXPOSURE_RETRY_BASE_DELAY_MS = 5_000;
const EXPOSURE_RETRY_MAX_DELAY_MS = 5 * 60 * 1000;
const EXPOSURE_SYNC_BATCH_SIZE = 8;

interface PendingFahamExposureEvent {
  ayahKey: string;
  id: string;
  lastErrorAt: number | null;
  nextRetryAt: number;
  payload: FahamExposureInput;
  queuedAt: number;
  retryCount: number;
  sourceKey: string;
}

type ExposureSyncResult = "synced" | "drop" | "retry";

let isExposureSyncSetup = false;
let isExposureSyncRunning = false;
let scheduledFlushTimer: ReturnType<typeof setTimeout> | null = null;

function getStorage(): Storage | null {
  if (typeof localStorage === "undefined") {
    return null;
  }

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

function isValidExposurePayload(value: unknown): value is FahamExposureInput {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;
  const sourceType = record.sourceType;
  const ayahIds = record.ayahIds;

  if (!isPositiveIntArray(ayahIds)) {
    return false;
  }

  if (sourceType === "reading_page") {
    const pageNumber = record.pageNumber;
    const surahId = record.surahId;
    if (!isPositiveInt(pageNumber) || pageNumber > 604) {
      return false;
    }
    if (surahId !== undefined && surahId !== null && (!isPositiveInt(surahId) || surahId > 114)) {
      return false;
    }
    return true;
  }

  if (sourceType === "theme_chunk") {
    const surahId = record.surahId;
    const themeChunkIndex = record.themeChunkIndex;
    return (
      isPositiveInt(surahId) &&
      surahId <= 114 &&
      isPositiveInt(themeChunkIndex)
    );
  }

  if (sourceType === "hifz_ayah") {
    const surahId = record.surahId;
    return (
      ayahIds.length === 1 &&
      (surahId === undefined || surahId === null || (isPositiveInt(surahId) && surahId <= 114))
    );
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

function computeRetryDelayMs(retryCount: number): number {
  const exponent = Math.max(0, retryCount - 1);
  const delay = EXPOSURE_RETRY_BASE_DELAY_MS * (2 ** exponent);
  return Math.min(EXPOSURE_RETRY_MAX_DELAY_MS, delay);
}

function shouldDropStaleEvent(event: Pick<PendingFahamExposureEvent, "queuedAt">): boolean {
  return Date.now() - event.queuedAt > EXPOSURE_MAX_AGE_MS;
}

function parsePendingExposureEvent(raw: unknown): PendingFahamExposureEvent | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }

  const record = raw as Record<string, unknown>;
  const id = record.id;
  const sourceKey = record.sourceKey;
  const ayahKey = record.ayahKey;
  const queuedAt = record.queuedAt;
  const payload = record.payload;
  const retryCount = record.retryCount;
  const nextRetryAt = record.nextRetryAt;
  const lastErrorAt = record.lastErrorAt;

  if (
    typeof id !== "string" ||
    typeof sourceKey !== "string" ||
    typeof ayahKey !== "string" ||
    !isPositiveTimestamp(queuedAt) ||
    !isValidExposurePayload(payload)
  ) {
    return null;
  }

  const normalizedRetryCount = isNonNegativeInt(retryCount) ? retryCount : 0;
  const normalizedNextRetryAt = isPositiveTimestamp(nextRetryAt)
    ? nextRetryAt
    : queuedAt;

  return {
    ayahKey,
    id,
    lastErrorAt: isPositiveTimestamp(lastErrorAt) ? lastErrorAt : null,
    nextRetryAt: normalizedNextRetryAt,
    payload,
    queuedAt,
    retryCount: normalizedRetryCount,
    sourceKey,
  };
}

function sanitizePendingExposureQueue(value: unknown): PendingFahamExposureEvent[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const deduped = new Map<string, PendingFahamExposureEvent>();
  for (const raw of value) {
    const event = parsePendingExposureEvent(raw);
    if (!event) {
      continue;
    }
    if (shouldDropStaleEvent(event)) {
      continue;
    }

    const identity = buildExposureIdentity(event);
    const existing = deduped.get(identity);
    if (!existing) {
      deduped.set(identity, event);
      continue;
    }

    const keepExisting =
      existing.queuedAt <= event.queuedAt &&
      existing.retryCount <= event.retryCount;
    if (!keepExisting) {
      deduped.set(identity, event);
    }
  }

  return Array.from(deduped.values()).sort((a, b) => {
    if (a.nextRetryAt === b.nextRetryAt) {
      return a.queuedAt - b.queuedAt;
    }
    return a.nextRetryAt - b.nextRetryAt;
  });
}

function persistPendingExposureQueue(queue: PendingFahamExposureEvent[]): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  try {
    storage.setItem(LS_KEY_PENDING_EXPOSURE, JSON.stringify(queue));
  } catch {
    // Ignore storage failures.
  }
}

function clearScheduledFlushTimer(): void {
  if (scheduledFlushTimer === null) {
    return;
  }

  clearTimeout(scheduledFlushTimer);
  scheduledFlushTimer = null;
}

function scheduleQueuedExposureFlush(queue: PendingFahamExposureEvent[]): void {
  if (typeof window === "undefined") {
    return;
  }

  clearScheduledFlushTimer();
  if (queue.length === 0) {
    return;
  }

  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return;
  }

  const nextRetryAt = queue.reduce((earliest, event) => {
    return event.nextRetryAt < earliest ? event.nextRetryAt : earliest;
  }, Number.POSITIVE_INFINITY);
  if (!Number.isFinite(nextRetryAt)) {
    return;
  }

  const delayMs = Math.max(300, nextRetryAt - Date.now());
  scheduledFlushTimer = setTimeout(() => {
    void flushQueuedFahamExposureEvents();
  }, delayMs);
}

export function loadPendingFahamExposureQueue(): PendingFahamExposureEvent[] {
  const storage = getStorage();
  if (!storage) {
    return [];
  }

  const raw = storage.getItem(LS_KEY_PENDING_EXPOSURE);
  if (!raw) {
    return [];
  }

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

  if (sanitized.length !== (Array.isArray(parsed) ? parsed.length : 0)) {
    persistPendingExposureQueue(sanitized);
  }

  return sanitized;
}

function replacePendingFahamExposureQueue(
  queue: PendingFahamExposureEvent[],
): PendingFahamExposureEvent[] {
  const sanitized = sanitizePendingExposureQueue(queue);
  persistPendingExposureQueue(sanitized);
  return sanitized;
}

export function enqueueFahamExposureEvent(
  payload: FahamExposureInput,
): PendingFahamExposureEvent[] {
  if (!isValidExposurePayload(payload)) {
    return loadPendingFahamExposureQueue();
  }

  const sourceKey = buildFahamSourceKey(payload);
  const ayahKey = payload.ayahIds.join(",");
  const currentQueue = loadPendingFahamExposureQueue();
  const duplicate = currentQueue.some(
    (event) => event.sourceKey === sourceKey && event.ayahKey === ayahKey,
  );
  if (duplicate) {
    scheduleQueuedExposureFlush(currentQueue);
    return currentQueue;
  }

  const now = Date.now();
  const nextEvent: PendingFahamExposureEvent = {
    ayahKey,
    id: `${now}-${Math.random().toString(36).slice(2, 10)}`,
    lastErrorAt: null,
    nextRetryAt: now,
    payload,
    queuedAt: now,
    retryCount: 0,
    sourceKey,
  };

  const nextQueue = replacePendingFahamExposureQueue([...currentQueue, nextEvent]);
  scheduleQueuedExposureFlush(nextQueue);
  return nextQueue;
}

async function postExposureEvent(
  event: PendingFahamExposureEvent,
): Promise<ExposureSyncResult> {
  try {
    const response = await fetch("/api/faham/exposure", {
      body: JSON.stringify(event.payload),
      headers: {
        "Content-Type": "application/json",
        "X-Miftah-Exposure-Event-Id": event.id,
      },
      keepalive: true,
      method: "POST",
    });

    if (!response.ok) {
      if (
        response.status === 400 ||
        response.status === 401 ||
        response.status === 403 ||
        response.status === 404
      ) {
        return "drop";
      }
      return "retry";
    }

    try {
      const data = (await response.json()) as { ok?: boolean; reason?: string };
      if (data.ok === false && data.reason === "unauthenticated") {
        return "drop";
      }
    } catch {
      // If body is not JSON we still treat HTTP 2xx as synced.
    }

    return "synced";
  } catch {
    return "retry";
  }
}

export async function flushQueuedFahamExposureEvents(): Promise<number> {
  if (isExposureSyncRunning) {
    return loadPendingFahamExposureQueue().length;
  }

  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return loadPendingFahamExposureQueue().length;
  }

  isExposureSyncRunning = true;

  try {
    let queue = loadPendingFahamExposureQueue();
    if (queue.length === 0) {
      clearScheduledFlushTimer();
      return 0;
    }

    let processed = 0;
    while (queue.length > 0 && processed < EXPOSURE_SYNC_BATCH_SIZE) {
      const now = Date.now();
      const readyIndex = queue.findIndex((event) => event.nextRetryAt <= now);
      if (readyIndex === -1) {
        break;
      }

      const nextEvent = queue[readyIndex];
      if (!nextEvent) {
        break;
      }

      const result = await postExposureEvent(nextEvent);
      if (result === "synced" || result === "drop") {
        queue = replacePendingFahamExposureQueue([
          ...queue.slice(0, readyIndex),
          ...queue.slice(readyIndex + 1),
        ]);
        processed += 1;
        continue;
      }

      const nextRetryCount = nextEvent.retryCount + 1;
      if (nextRetryCount >= EXPOSURE_MAX_RETRY_COUNT) {
        queue = replacePendingFahamExposureQueue([
          ...queue.slice(0, readyIndex),
          ...queue.slice(readyIndex + 1),
        ]);
        processed += 1;
        continue;
      }

      const retryAt = now + computeRetryDelayMs(nextRetryCount);
      const retriableEvent: PendingFahamExposureEvent = {
        ...nextEvent,
        lastErrorAt: now,
        nextRetryAt: retryAt,
        retryCount: nextRetryCount,
      };
      queue = replacePendingFahamExposureQueue([
        ...queue.slice(0, readyIndex),
        retriableEvent,
        ...queue.slice(readyIndex + 1),
      ]);
      break;
    }

    scheduleQueuedExposureFlush(queue);
    return queue.length;
  } finally {
    isExposureSyncRunning = false;
  }
}

export function setupFahamExposureSync(): void {
  if (typeof window === "undefined" || isExposureSyncSetup) {
    return;
  }

  isExposureSyncSetup = true;
  window.addEventListener("online", () => {
    void flushQueuedFahamExposureEvents();
  });
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      void flushQueuedFahamExposureEvents();
    }
  });
  scheduleQueuedExposureFlush(loadPendingFahamExposureQueue());
}
