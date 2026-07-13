"use client";

import { buildFahamSourceKey } from "./source-key";
import {
  isValidExposurePayload,
  loadPendingFahamExposureQueue,
  replacePendingFahamExposureQueue,
} from "./exposureSyncStore";
import type { PendingFahamExposureEvent } from "./exposureSyncTypes";
import type { FahamExposureInput } from "./types";

const EXPOSURE_MAX_RETRY_COUNT = 6;
const EXPOSURE_RETRY_BASE_DELAY_MS = 5_000;
const EXPOSURE_RETRY_MAX_DELAY_MS = 5 * 60 * 1000;
const EXPOSURE_SYNC_BATCH_SIZE = 8;
type ExposureSyncResult = "synced" | "drop" | "retry";

// This state intentionally stays in one module so every consumer shares one
// scheduler, one running lock, and one set of browser event listeners.
let isExposureSyncSetup = false;
let isExposureSyncRunning = false;
let scheduledFlushTimer: ReturnType<typeof setTimeout> | null = null;

function computeRetryDelayMs(retryCount: number): number {
  const exponent = Math.max(0, retryCount - 1);
  return Math.min(EXPOSURE_RETRY_MAX_DELAY_MS, EXPOSURE_RETRY_BASE_DELAY_MS * (2 ** exponent));
}

function clearScheduledFlushTimer(): void {
  if (scheduledFlushTimer === null) return;
  clearTimeout(scheduledFlushTimer);
  scheduledFlushTimer = null;
}

function scheduleQueuedExposureFlush(queue: PendingFahamExposureEvent[]): void {
  if (typeof window === "undefined") return;
  clearScheduledFlushTimer();
  if (queue.length === 0 || (typeof navigator !== "undefined" && navigator.onLine === false)) return;
  const nextRetryAt = queue.reduce((earliest, event) => event.nextRetryAt < earliest ? event.nextRetryAt : earliest, Number.POSITIVE_INFINITY);
  if (!Number.isFinite(nextRetryAt)) return;
  scheduledFlushTimer = setTimeout(() => void flushQueuedFahamExposureEvents(), Math.max(300, nextRetryAt - Date.now()));
}

export function enqueueFahamExposureEvent(payload: FahamExposureInput): PendingFahamExposureEvent[] {
  if (!isValidExposurePayload(payload)) return loadPendingFahamExposureQueue();
  const sourceKey = buildFahamSourceKey(payload);
  const ayahKey = payload.ayahIds.join(",");
  const currentQueue = loadPendingFahamExposureQueue();
  if (currentQueue.some((event) => event.sourceKey === sourceKey && event.ayahKey === ayahKey)) {
    scheduleQueuedExposureFlush(currentQueue);
    return currentQueue;
  }
  const now = Date.now();
  const nextQueue = replacePendingFahamExposureQueue([...currentQueue, {
    ayahKey,
    id: `${now}-${Math.random().toString(36).slice(2, 10)}`,
    lastErrorAt: null,
    nextRetryAt: now,
    payload,
    queuedAt: now,
    retryCount: 0,
    sourceKey,
  }]);
  scheduleQueuedExposureFlush(nextQueue);
  return nextQueue;
}

async function postExposureEvent(event: PendingFahamExposureEvent): Promise<ExposureSyncResult> {
  try {
    const response = await fetch("/api/faham/exposure", {
      body: JSON.stringify(event.payload),
      headers: { "Content-Type": "application/json", "X-Miftah-Exposure-Event-Id": event.id },
      keepalive: true,
      method: "POST",
    });
    if (!response.ok) return [400, 401, 403, 404].includes(response.status) ? "drop" : "retry";
    try {
      const data = (await response.json()) as { ok?: boolean; reason?: string };
      if (data.ok === false && data.reason === "unauthenticated") return "drop";
    } catch {
      // A non-JSON 2xx response still counts as synced.
    }
    return "synced";
  } catch {
    return "retry";
  }
}

export async function flushQueuedFahamExposureEvents(): Promise<number> {
  if (isExposureSyncRunning || (typeof navigator !== "undefined" && navigator.onLine === false)) return loadPendingFahamExposureQueue().length;
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
      if (readyIndex === -1) break;
      const nextEvent = queue[readyIndex];
      if (!nextEvent) break;
      const result = await postExposureEvent(nextEvent);
      if (result === "synced" || result === "drop") {
        queue = replacePendingFahamExposureQueue([...queue.slice(0, readyIndex), ...queue.slice(readyIndex + 1)]);
        processed += 1;
        continue;
      }
      const nextRetryCount = nextEvent.retryCount + 1;
      if (nextRetryCount >= EXPOSURE_MAX_RETRY_COUNT) {
        queue = replacePendingFahamExposureQueue([...queue.slice(0, readyIndex), ...queue.slice(readyIndex + 1)]);
        processed += 1;
        continue;
      }
      queue = replacePendingFahamExposureQueue([
        ...queue.slice(0, readyIndex),
        { ...nextEvent, lastErrorAt: now, nextRetryAt: now + computeRetryDelayMs(nextRetryCount), retryCount: nextRetryCount },
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
  if (typeof window === "undefined" || isExposureSyncSetup) return;
  isExposureSyncSetup = true;
  window.addEventListener("online", () => void flushQueuedFahamExposureEvents());
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void flushQueuedFahamExposureEvents();
  });
  scheduleQueuedExposureFlush(loadPendingFahamExposureQueue());
}
