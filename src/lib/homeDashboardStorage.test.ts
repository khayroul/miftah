import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyHomeDashboardSnapshot,
  hasHomeDashboardData,
  loadHomeDashboardSnapshotCache,
  sanitizeHomeDashboardSnapshot,
  saveHomeDashboardSnapshotCache,
} from "./homeDashboardStorage";

function createStorage() {
  const values = new Map<string, string>();

  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
}

test("sanitizeHomeDashboardSnapshot returns empty defaults for invalid input", () => {
  assert.deepEqual(sanitizeHomeDashboardSnapshot(null), emptyHomeDashboardSnapshot());
});

test("sanitizeHomeDashboardSnapshot keeps valid dashboard segments", () => {
  const snapshot = sanitizeHomeDashboardSnapshot({
    faham: {
      blockedReason: null,
      coveragePct: 20,
      dueCount: 5,
      encounteredWordCount: 200,
      eligibleNewCount: 12,
      focusWordLimit: 1000,
      levelProgress: {
        activeLevel: 1,
        activeWordLimit: 1000,
        isMaxLevel: false,
        lemmaUnlocked: false,
        maxLevel: 4,
        nextLevel: 2,
        nextWordLimit: 2000,
        unlockFoundProgress: 200,
        unlockFoundRequired: 600,
        unlockMasteredProgress: 80,
        unlockMasteredRequired: 120,
        unlockReady: false,
      },
      masteredWordCount: 80,
      reviewedWordCount: 140,
      totalCandidateCount: 400,
      totalWords: 1000,
    },
    hifz: {
      dueTodayPages: 3,
      manzilCoveragePct: 14,
      nextAyahKey: "2:255",
      nextPageLabel: "Halaman 42 · Al-Baqarah",
      nextBlock: "sabqi",
      nextPage: 42,
      streak: 7,
      todayPages: 4,
      totalManzilPages: 85,
    },
    read: {
      lastPage: 42,
      lastReadAt: "2026-03-14T00:00:00.000Z",
      uniquePages7d: 8,
      uniquePagesLifetime: 21,
    },
    tema: {
      completedCount: 3,
      completedPct: 12,
      exploredCount: 9,
      exploredPct: 36,
      totalChunks: 25,
    },
    activity: {
      streak: 5,
      dailyGoalCount: 10,
      dailyGoalType: "hifz_pages",
      legacyHifzGoalRecommendation: {
        currentAyahGoal: 12,
        suggestedPageGoal: 1,
        targetType: "hifz_pages",
      },
      todayProgress: 4,
    },
  });

  assert.equal(snapshot.read?.lastPage, 42);
  assert.equal(snapshot.faham?.levelProgress.activeLevel, 1);
  assert.equal(snapshot.activity?.dailyGoalType, "hifz_pages");
  assert.equal(hasHomeDashboardData(snapshot), true);
});

test("home dashboard cache round-trips per user", () => {
  const storage = createStorage();
  const snapshot = sanitizeHomeDashboardSnapshot({
    faham: null,
    hifz: null,
    read: {
      lastPage: 586,
      lastReadAt: "2026-03-14T00:00:00.000Z",
      uniquePages7d: 2,
      uniquePagesLifetime: 11,
    },
    tema: null,
    activity: {
      streak: 2,
      dailyGoalCount: 10,
      dailyGoalType: "read_pages",
      legacyHifzGoalRecommendation: null,
      todayProgress: 2,
    },
  });

  assert.equal(saveHomeDashboardSnapshotCache("user-1", snapshot, storage), true);
  assert.deepEqual(loadHomeDashboardSnapshotCache("user-1", storage), snapshot);
  assert.equal(loadHomeDashboardSnapshotCache("user-2", storage), null);
});
