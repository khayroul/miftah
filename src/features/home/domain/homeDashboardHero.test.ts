import assert from "node:assert/strict";
import test from "node:test";
import { buildHomeHero } from "./homeDashboardHero";
import type { HomeDashboardSnapshot } from "./homeDashboard";

function createSnapshot(
  overrides: Partial<HomeDashboardSnapshot> = {},
): HomeDashboardSnapshot {
  return {
    activity: null,
    faham: null,
    hifz: null,
    read: null,
    tema: null,
    ...overrides,
  };
}

test("prioritizes due hifz over other available actions", () => {
  const hero = buildHomeHero({
    activeSurahId: 2,
    activeSurahName: "Al-Baqarah",
    continuePage: 25,
    formattedLastRead: "13 Mac",
    hifzReadHref: "/read/25?mode=hifz&from=dashboard",
    snapshot: createSnapshot({
      faham: {
        blockedReason: null,
        exposureProgressPct: 20,
        dueCount: 8,
        encounteredWordCount: 200,
        eligibleNewCount: 10,
        focusWordLimit: 1000,
        levelProgress: {
          activeLevel: 2,
          activeWordLimit: 1000,
          isMaxLevel: false,
          lemmaUnlocked: false,
          maxLevel: 4,
          nextLevel: 3,
          nextWordLimit: 2000,
          unlockFoundProgress: 200,
          unlockFoundRequired: 300,
          unlockMasteredProgress: 80,
          unlockMasteredRequired: 120,
          unlockReady: false,
        },
        masteredWordCount: 80,
        reviewedWordCount: 90,
        totalCandidateCount: 200,
        totalWords: 1000,
      },
      hifz: {
        dueTodayPages: 4,
        manzilCoveragePct: 5,
        nextAyahKey: "2:255",
        nextPageLabel: "Halaman 42 · Al-Baqarah",
        nextBlock: "sabqi",
        nextPage: 42,
        streak: 3,
        todayPages: 7,
        totalManzilPages: 30,
      },
      read: {
        lastPage: 25,
        lastReadAt: "2026-03-13T10:00:00.000Z",
        uniquePages7d: 3,
        uniquePagesLifetime: 12,
      },
    }),
  });

  assert.equal(hero.title, "Ulang hafalan yang due");
  assert.equal(hero.primaryMode, "hifz");
  assert.equal(hero.primaryHref, "/read/25?mode=hifz&from=dashboard");
});

test("falls back to due faham when hifz is not due", () => {
  const hero = buildHomeHero({
    activeSurahId: 1,
    activeSurahName: "Al-Fatihah",
    continuePage: 1,
    formattedLastRead: "Belum ada aktiviti",
    hifzReadHref: "/read/1?mode=hifz&from=dashboard",
    snapshot: createSnapshot({
      faham: {
        blockedReason: "due_backlog",
        exposureProgressPct: 10,
        dueCount: 6,
        encounteredWordCount: 120,
        eligibleNewCount: 0,
        focusWordLimit: 1000,
        levelProgress: {
          activeLevel: 1,
          activeWordLimit: 1000,
          isMaxLevel: false,
          lemmaUnlocked: false,
          maxLevel: 4,
          nextLevel: 2,
          nextWordLimit: 2000,
          unlockFoundProgress: 120,
          unlockFoundRequired: 300,
          unlockMasteredProgress: 40,
          unlockMasteredRequired: 72,
          unlockReady: false,
        },
        masteredWordCount: 40,
        reviewedWordCount: 60,
        totalCandidateCount: 180,
        totalWords: 1000,
      },
      hifz: {
        dueTodayPages: 0,
        manzilCoveragePct: 0,
        nextAyahKey: null,
        nextPageLabel: null,
        nextBlock: null,
        nextPage: null,
        streak: 0,
        todayPages: 0,
        totalManzilPages: 0,
      },
    }),
  });

  assert.equal(hero.title, "Ulang Faham yang menunggu");
  assert.equal(hero.primaryMode, "faham");
  assert.equal(hero.primaryHref, "/faham");
  assert.deepEqual(hero.stats[3], {
    label: "Ditemui",
    value: "120 / 1000",
  });
});

test("continues reading when no due work is present but read progress exists", () => {
  const hero = buildHomeHero({
    activeSurahId: 36,
    activeSurahName: "Ya-Sin",
    continuePage: 440,
    formattedLastRead: "12 Mac",
    hifzReadHref: "/read/440?mode=hifz&from=dashboard",
    snapshot: createSnapshot({
      read: {
        lastPage: 440,
        lastReadAt: "2026-03-12T10:00:00.000Z",
        uniquePages7d: 5,
        uniquePagesLifetime: 30,
      },
    }),
  });

  assert.equal(hero.title, "Sambung bacaan terakhir");
  assert.equal(hero.primaryMode, "read");
  assert.equal(hero.primaryHref, "/read/440");
});

test("guides zero-state users toward a first reading session", () => {
  const hero = buildHomeHero({
    activeSurahId: 1,
    activeSurahName: "Al-Fatihah",
    continuePage: 1,
    formattedLastRead: "Belum ada aktiviti",
    hifzReadHref: "/read/1?mode=hifz&from=dashboard",
    snapshot: createSnapshot(),
  });

  assert.equal(hero.isZeroState, true);
  assert.equal(hero.title, "Mulakan dengan satu tindakan yang jelas");
  assert.equal(hero.primaryLabel, "Mula Baca");
});
