import assert from "node:assert/strict";
import test from "node:test";
import type { FahamExposureSignal } from "./exposureSync";
import type { FahamLevelProgress } from "./levels";
import { buildOfflineFahamQueueSnapshotFromTierPayload } from "./offlineQueue";
import type { CachedFahamTierVocabPayload } from "./tierVocabPackage";

const tierPayload: CachedFahamTierVocabPayload = {
  dataVersion: "1",
  generatedAt: new Date().toISOString(),
  level: 1,
  maxLevel: 4,
  ok: true,
  wordLimit: 1000,
  words: [
    {
      frequency: 1500,
      id: 1,
      textSimple: "bismi",
      textUthmani: "بِسْمِ",
      translationBm: "Dengan nama",
      translationEn: "In the name",
      transliteration: "bismi",
    },
    {
      frequency: 1400,
      id: 2,
      textSimple: "allah",
      textUthmani: "اللَّهِ",
      translationBm: "Allah",
      translationEn: "Allah",
      transliteration: "allahi",
    },
    {
      frequency: 1300,
      id: 3,
      textSimple: "rahman",
      textUthmani: "الرَّحْمَٰنِ",
      translationBm: "Yang Maha Pemurah",
      translationEn: "Most Compassionate",
      transliteration: "ar-rahman",
    },
    {
      frequency: 1200,
      id: 4,
      textSimple: "rahim",
      textUthmani: "الرَّحِيمِ",
      translationBm: "Yang Maha Penyayang",
      translationEn: "Most Merciful",
      transliteration: "ar-rahim",
    },
    {
      frequency: 1100,
      id: 5,
      textSimple: "hamd",
      textUthmani: "الْحَمْدُ",
      translationBm: "Segala puji",
      translationEn: "All praise",
      transliteration: "al-hamdu",
    },
    {
      frequency: 1000,
      id: 6,
      textSimple: "rabb",
      textUthmani: "رَبِّ",
      translationBm: "Tuhan",
      translationEn: "Lord",
      transliteration: "rabbi",
    },
  ],
};

const levelProgressHint: FahamLevelProgress = {
  activeLevel: 2,
  activeWordLimit: 600,
  isMaxLevel: false,
  lemmaUnlocked: false,
  maxLevel: 4,
  nextLevel: 3,
  nextWordLimit: 3000,
  unlockFoundProgress: 200,
  unlockFoundRequired: 1200,
  unlockMasteredProgress: 0,
  unlockMasteredRequired: 0,
  unlockReady: false,
};

const exposureSignals: FahamExposureSignal[] = [
  {
    ayahIds: [2, 3, 4],
    pageNumber: 1,
    queuedAt: Date.now(),
    sourceKey: "reading-page:1",
    sourceType: "reading_page",
    surahId: 1,
  },
  {
    ayahIds: [12, 13, 14],
    queuedAt: Date.now() - 1_000,
    sourceKey: "theme-chunk:2:3",
    sourceType: "theme_chunk",
    surahId: 2,
    themeChunkIndex: 3,
  },
  {
    ayahIds: [8],
    queuedAt: Date.now() - 2_000,
    sourceKey: "hifz-ayah:8",
    sourceType: "hifz_ayah",
    surahId: 1,
  },
];

test("buildOfflineFahamQueueSnapshotFromTierPayload builds new cards with source metadata", () => {
  const snapshot = buildOfflineFahamQueueSnapshotFromTierPayload({
    directionMode: "arab_to_bm",
    exposureSignals,
    isRevision: false,
    levelProgressHint,
    payload: tierPayload,
    preset: "theme",
  });

  assert.ok(snapshot.new.length > 0);
  assert.equal(snapshot.due.length, 0);
  assert.equal(snapshot.stats.eligibleNewCount, snapshot.new.length);
  assert.equal(snapshot.stats.focusWordLimit, tierPayload.wordLimit);
  assert.equal(snapshot.levelProgress.activeWordLimit, tierPayload.wordLimit);
  assert.ok(snapshot.new.every((card) => card.progressId < 0));
  assert.ok(snapshot.new.every((card) => card.kind === "new"));
  assert.equal(snapshot.new[0]?.sourceContext?.sources.length, 3);
  assert.ok(
    snapshot.new[0]?.sourceContext?.sources.some(
      (source) => source.href === "/read/1" && source.type === "reading_page",
    ),
  );
  assert.ok(
    snapshot.new[0]?.sourceContext?.sources.some(
      (source) =>
        source.href === "/read/surah/2/themes?chunk=3" &&
        source.type === "theme_chunk",
    ),
  );
});

test("buildOfflineFahamQueueSnapshotFromTierPayload maps revision mode cards into due bucket", () => {
  const snapshot = buildOfflineFahamQueueSnapshotFromTierPayload({
    directionMode: "mixed",
    exposureSignals,
    isRevision: true,
    payload: tierPayload,
    preset: "reading",
  });

  assert.ok(snapshot.due.length > 0);
  assert.equal(snapshot.new.length, 0);
  assert.equal(snapshot.stats.dueCount, snapshot.due.length);
  assert.ok(snapshot.due.every((card) => card.kind === "due"));
});

