import assert from "node:assert/strict";
import test from "node:test";
import type { FahamQueueSnapshot } from "./queue";
import {
  enqueuePendingFahamRating,
  loadCachedFahamQueue,
  loadCachedFahamStats,
  loadPendingFahamRatings,
  replacePendingFahamRatings,
  saveCachedFahamQueue,
  saveCachedFahamStats,
} from "./offlineSync";

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

function buildSnapshot(): FahamQueueSnapshot {
  return {
    blockedReason: null,
    due: [],
    learning: [],
    mastered: [],
    new: [],
    levelProgress: {
      activeLevel: 1,
      activeWordLimit: 1000,
      isMaxLevel: false,
      lemmaUnlocked: false,
      maxLevel: 4,
      nextLevel: 2,
      nextWordLimit: 2000,
      unlockFoundProgress: 0,
      unlockFoundRequired: 600,
      unlockMasteredProgress: 0,
      unlockMasteredRequired: 0,
      unlockReady: false,
    },
    stats: {
      dueCount: 0,
      eligibleNewCount: 0,
      focusWordLimit: 1000,
      learningCount: 0,
      masteredCount: 0,
      totalCandidateCount: 0,
    },
  };
}

test.beforeEach(() => {
  storage.clear();
});

test("enqueuePendingFahamRating persists ratings in FIFO order", () => {
  enqueuePendingFahamRating({ progressId: 11, rating: 3 });
  enqueuePendingFahamRating({ progressId: 12, rating: 1 });

  const pending = loadPendingFahamRatings();
  assert.equal(pending.length, 2);
  assert.equal(pending[0]?.progressId, 11);
  assert.equal(pending[1]?.progressId, 12);
});

test("replacePendingFahamRatings removes invalid pending entries", () => {
  const next = replacePendingFahamRatings([
    {
      id: "valid",
      progressId: 77,
      queuedAt: Date.now(),
      rating: 3,
    },
    {
      id: "invalid",
      progressId: -1,
      queuedAt: Date.now(),
      rating: 3,
    },
  ]);

  assert.equal(next.length, 1);
  assert.equal(next[0]?.progressId, 77);
});

test("saveCachedFahamQueue round-trips queue settings and snapshot", () => {
  const snapshot = buildSnapshot();
  saveCachedFahamQueue({
    directionMode: "mixed",
    isRevision: true,
    preset: "theme",
    snapshot,
  });

  const cached = loadCachedFahamQueue();
  assert.ok(cached);
  assert.equal(cached?.directionMode, "mixed");
  assert.equal(cached?.isRevision, true);
  assert.equal(cached?.preset, "theme");
  assert.deepEqual(cached?.snapshot, snapshot);
});

test("saveCachedFahamStats round-trips stats and ignores malformed payload", () => {
  saveCachedFahamStats({
    dueToday: 7,
    learning: 12,
    mastered: 55,
    retentionRate7d: 0.91,
    wordBank: 120,
    levelProgress: {
      activeLevel: 1,
      activeWordLimit: 1000,
      isMaxLevel: false,
      lemmaUnlocked: false,
      maxLevel: 4,
      nextLevel: 2,
      nextWordLimit: 2000,
      unlockFoundProgress: 120,
      unlockFoundRequired: 600,
      unlockMasteredProgress: 0,
      unlockMasteredRequired: 0,
      unlockReady: false,
    },
  });

  const cached = loadCachedFahamStats();
  assert.ok(cached);
  assert.equal(cached?.stats.wordBank, 120);

  storage.setItem("miftah:faham:stats-cache:v1", '{"savedAt":"oops","stats":{}}');
  assert.equal(loadCachedFahamStats(), null);
});
