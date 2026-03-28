import assert from "node:assert/strict";
import test from "node:test";
import {
  enqueueFahamExposureEvent,
  flushQueuedFahamExposureEvents,
  loadPendingFahamExposureQueue,
} from "./exposureSync";
import type { FahamExposureInput } from "./types";

const PENDING_EXPOSURE_KEY = "miftah:faham:pending-exposure:v1";

function createStorageMock(): Storage {
  const store = new Map<string, string>();
  return {
    get length(): number {
      return store.size;
    },
    clear(): void {
      store.clear();
    },
    getItem(key: string): string | null {
      return store.has(key) ? store.get(key) ?? null : null;
    },
    key(index: number): string | null {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string): void {
      store.delete(key);
    },
    setItem(key: string, value: string): void {
      store.set(key, value);
    },
  };
}

const storage = createStorageMock();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: storage,
});

const readingPayload: FahamExposureInput = {
  ayahIds: [1, 2, 3],
  pageNumber: 1,
  sourceType: "reading_page",
  surahId: 1,
};

test.beforeEach(() => {
  storage.clear();
  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    value: undefined,
    writable: true,
  });
});

test("enqueueFahamExposureEvent stores payload and de-dupes same source event", () => {
  enqueueFahamExposureEvent(readingPayload);
  enqueueFahamExposureEvent(readingPayload);

  const queue = loadPendingFahamExposureQueue();
  assert.equal(queue.length, 1);
  assert.deepEqual(queue[0]?.payload, readingPayload);
});

test("loadPendingFahamExposureQueue sanitizes malformed queue entries", () => {
  storage.setItem(
    PENDING_EXPOSURE_KEY,
    JSON.stringify([
      {
        ayahKey: "1,2,3",
        id: "valid",
        lastErrorAt: null,
        nextRetryAt: Date.now(),
        payload: readingPayload,
        queuedAt: Date.now(),
        retryCount: 0,
        sourceKey: "reading-page:1",
      },
      {
        ayahKey: "broken",
        id: "broken",
        payload: { sourceType: "reading_page", pageNumber: 700, ayahIds: [1] },
        queuedAt: Date.now(),
        sourceKey: "reading-page:broken",
      },
    ]),
  );

  const queue = loadPendingFahamExposureQueue();
  assert.equal(queue.length, 1);
  assert.equal(queue[0]?.sourceKey, "reading-page:1");
});

test("loadPendingFahamExposureQueue drops stale and duplicate pending entries", () => {
  const now = Date.now();
  storage.setItem(
    PENDING_EXPOSURE_KEY,
    JSON.stringify([
      {
        ayahKey: "1,2,3",
        id: "older-valid",
        lastErrorAt: null,
        nextRetryAt: now,
        payload: readingPayload,
        queuedAt: now,
        retryCount: 0,
        sourceKey: "reading-page:1",
      },
      {
        ayahKey: "1,2,3",
        id: "newer-duplicate",
        lastErrorAt: null,
        nextRetryAt: now,
        payload: readingPayload,
        queuedAt: now + 10,
        retryCount: 0,
        sourceKey: "reading-page:1",
      },
      {
        ayahKey: "4,5,6",
        id: "stale-entry",
        lastErrorAt: null,
        nextRetryAt: now - 8 * 24 * 60 * 60 * 1000,
        payload: {
          ayahIds: [4, 5, 6],
          pageNumber: 2,
          sourceType: "reading_page",
          surahId: 1,
        },
        queuedAt: now - 8 * 24 * 60 * 60 * 1000,
        retryCount: 0,
        sourceKey: "reading-page:2",
      },
    ]),
  );

  const queue = loadPendingFahamExposureQueue();
  assert.equal(queue.length, 1);
  assert.equal(queue[0]?.id, "older-valid");
});

test("flushQueuedFahamExposureEvents drains successful events", async () => {
  enqueueFahamExposureEvent(readingPayload);
  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    value: async () =>
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
      }),
    writable: true,
  });

  const remaining = await flushQueuedFahamExposureEvents();
  assert.equal(remaining, 0);
  assert.equal(loadPendingFahamExposureQueue().length, 0);
});

test("flushQueuedFahamExposureEvents schedules retry when server is unavailable", async () => {
  enqueueFahamExposureEvent(readingPayload);
  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    value: async () => new Response("error", { status: 503 }),
    writable: true,
  });

  const remaining = await flushQueuedFahamExposureEvents();
  assert.equal(remaining, 1);
  const queue = loadPendingFahamExposureQueue();
  assert.equal(queue.length, 1);
  assert.equal(queue[0]?.retryCount, 1);
  assert.ok((queue[0]?.nextRetryAt ?? 0) > Date.now());
});

test("flushQueuedFahamExposureEvents drops event after max retries", async () => {
  const now = Date.now();
  storage.setItem(
    PENDING_EXPOSURE_KEY,
    JSON.stringify([
      {
        ayahKey: "1,2,3",
        id: "max-retry",
        lastErrorAt: now - 1_000,
        nextRetryAt: now - 100,
        payload: readingPayload,
        queuedAt: now,
        retryCount: 5,
        sourceKey: "reading-page:1",
      },
    ]),
  );

  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    value: async () => new Response("error", { status: 503 }),
    writable: true,
  });

  const remaining = await flushQueuedFahamExposureEvents();
  assert.equal(remaining, 0);
  assert.equal(loadPendingFahamExposureQueue().length, 0);
});
