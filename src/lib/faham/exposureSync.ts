"use client";

import { buildFahamSourceKey } from "./source-key";
import type { FahamExposureInput } from "./types";

const LS_KEY_PENDING_EXPOSURE = "miftah:faham:pending-exposure:v1";

interface PendingFahamExposureEvent {
  ayahKey: string;
  id: string;
  payload: FahamExposureInput;
  queuedAt: number;
  sourceKey: string;
}

type ExposureSyncResult = "synced" | "drop" | "retry";

let isExposureSyncSetup = false;
let isExposureSyncRunning = false;

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

function sanitizePendingExposureQueue(value: unknown): PendingFahamExposureEvent[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const sanitized: PendingFahamExposureEvent[] = [];
  for (const raw of value) {
    if (typeof raw !== "object" || raw === null) {
      continue;
    }

    const record = raw as Record<string, unknown>;
    const id = record.id;
    const sourceKey = record.sourceKey;
    const ayahKey = record.ayahKey;
    const queuedAt = record.queuedAt;
    const payload = record.payload;

    if (
      typeof id !== "string" ||
      typeof sourceKey !== "string" ||
      typeof ayahKey !== "string" ||
      typeof queuedAt !== "number" ||
      !Number.isFinite(queuedAt) ||
      queuedAt <= 0 ||
      !isValidExposurePayload(payload)
    ) {
      continue;
    }

    sanitized.push({
      ayahKey,
      id,
      payload,
      queuedAt,
      sourceKey,
    });
  }

  return sanitized.sort((a, b) => a.queuedAt - b.queuedAt);
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
    return currentQueue;
  }

  const nextEvent: PendingFahamExposureEvent = {
    ayahKey,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    payload,
    queuedAt: Date.now(),
    sourceKey,
  };

  const nextQueue = [...currentQueue, nextEvent];
  persistPendingExposureQueue(nextQueue);
  return nextQueue;
}

async function postExposureEvent(payload: FahamExposureInput): Promise<ExposureSyncResult> {
  try {
    const response = await fetch("/api/faham/exposure", {
      body: JSON.stringify(payload),
      headers: {
        "Content-Type": "application/json",
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
    while (queue.length > 0) {
      const nextEvent = queue[0];
      if (!nextEvent) {
        break;
      }

      const result = await postExposureEvent(nextEvent.payload);
      if (result === "retry") {
        break;
      }

      queue = replacePendingFahamExposureQueue(queue.slice(1));
    }

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
}
