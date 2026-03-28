import assert from "node:assert/strict";
import test from "node:test";
import {
  enqueueFahamExposureEvent,
  flushQueuedFahamExposureEvents,
  loadPendingFahamExposureQueue,
} from "./exposureSync";
import type { FahamExposureInput } from "./types";

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
    "miftah:faham:pending-exposure:v1",
    JSON.stringify([
      {
        ayahKey: "1,2,3",
        id: "valid",
        payload: readingPayload,
        queuedAt: Date.now(),
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

test("flushQueuedFahamExposureEvents keeps event when server is unavailable", async () => {
  enqueueFahamExposureEvent(readingPayload);
  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    value: async () => new Response("error", { status: 503 }),
    writable: true,
  });

  const remaining = await flushQueuedFahamExposureEvents();
  assert.equal(remaining, 1);
  assert.equal(loadPendingFahamExposureQueue().length, 1);
});
