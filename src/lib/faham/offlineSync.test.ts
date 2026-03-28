import assert from "node:assert/strict";
import test from "node:test";
import type { FahamQueueSnapshot, SerializedFahamCard } from "./queue";
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

function buildCard(progressId: number): SerializedFahamCard {
  return {
    due: new Date().toISOString(),
    fsrs: {
      difficulty: 0,
      elapsedDays: 0,
      lapses: 0,
      lastReview: null,
      scheduledDays: 0,
      stability: 0,
    },
    kind: "new",
    mcq: {
      answerAudioUrl: null,
      answerLabel: "Makna BM",
      answerPrimary: "Dengan nama",
      answerSecondary: null,
      correctIndex: 0,
      direction: "arab_to_bm",
      options: [
        { dir: "ltr", lang: "ms", value: "Dengan nama" },
        { dir: "ltr", lang: "ms", value: "Segala puji" },
        { dir: "ltr", lang: "ms", value: "Rabb" },
        { dir: "ltr", lang: "ms", value: "Hari pembalasan" },
      ],
      promptAudioUrl: null,
      promptDir: "rtl",
      promptHint: "Pilih makna BM yang tepat.",
      promptLabel: "Perkataan Arab",
      promptLang: "ar",
      promptPrimary: "بِسْمِ",
      promptSecondary: "bismi",
      whyThisSet: [],
    },
    mistakeStreak: 0,
    needsReinforcement: false,
    progressId,
    reps: 0,
    state: 0,
    word: {
      frequency: 1000,
      id: Math.abs(progressId),
      textSimple: "bismi",
      textUthmani: "بِسْمِ",
      translationBm: "Dengan nama",
      translationEn: "In the name",
      transliteration: "bismi",
    },
  };
}

function buildSnapshot(newCards: SerializedFahamCard[] = []): FahamQueueSnapshot {
  return {
    blockedReason: null,
    due: [],
    learning: [],
    mastered: [],
    new: newCards,
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

test("enqueuePendingFahamRating accepts offline ratings keyed by wordId", () => {
  enqueuePendingFahamRating({ rating: 3, wordId: 91 });

  const pending = loadPendingFahamRatings();
  assert.equal(pending.length, 1);
  assert.equal(pending[0]?.progressId, undefined);
  assert.equal(pending[0]?.wordId, 91);
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
    {
      id: "valid-word",
      queuedAt: Date.now() + 1,
      rating: 1,
      wordId: 102,
    },
    {
      id: "invalid-missing-target",
      queuedAt: Date.now() + 2,
      rating: 3,
    },
  ]);

  assert.equal(next.length, 2);
  assert.equal(next[0]?.progressId, 77);
  assert.equal(next[1]?.wordId, 102);
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

test("saveCachedFahamQueue keeps synthetic offline cards with negative progress ids", () => {
  const snapshot = buildSnapshot([buildCard(-1)]);
  saveCachedFahamQueue({
    directionMode: "arab_to_bm",
    isRevision: false,
    preset: "reading",
    snapshot,
  });

  const cached = loadCachedFahamQueue();
  assert.ok(cached);
  assert.equal(cached?.snapshot.new[0]?.progressId, -1);
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
