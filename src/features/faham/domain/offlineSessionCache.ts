"use client";

import type { FahamLevelProgress } from "./levels";
import type { FahamMcqDirectionMode, FahamMeaningLocale } from "./mcq";
import type { FahamQueueSnapshot } from "./queue";
import type { FahamSourcePreset } from "./presets";
import {
  getOfflineStorage,
  isFiniteNumber,
  isObjectRecord,
  parseJson,
} from "./offlineSyncStorage";

// v2: the cached queue now carries `meaningLocale`. Bumping the key orphans
// every pre-change (v1, Malay-only) cache so a stale Malay deck can never be
// restored into an English session — belt-and-suspenders with the
// meaningLocale validation + match performed on load.
const LS_KEY_QUEUE_CACHE = "miftah:faham:queue-cache:v2";
const LS_KEY_STATS_CACHE = "miftah:faham:stats-cache:v1";

export interface CachedFahamQueue {
  directionMode: FahamMcqDirectionMode;
  meaningLocale: FahamMeaningLocale;
  isRevision: boolean;
  preset: FahamSourcePreset;
  savedAt: number;
  snapshot: FahamQueueSnapshot;
}

export interface CachedFahamStats {
  dueToday: number;
  learning: number;
  mastered: number;
  retentionRate7d: number;
  wordBank: number;
  levelProgress?: FahamLevelProgress;
}

interface CachedStatsEnvelope {
  savedAt: number;
  stats: CachedFahamStats;
}

function isSerializedFahamCardLike(value: unknown): boolean {
  if (!isObjectRecord(value)) {
    return false;
  }

  return (
    isFiniteNumber(value.progressId) &&
    Number.isInteger(value.progressId) &&
    value.progressId !== 0 &&
    isFiniteNumber(value.reps) &&
    isFiniteNumber(value.state) &&
    typeof value.due === "string" &&
    isObjectRecord(value.word) &&
    isObjectRecord(value.mcq)
  );
}

function isFahamQueueSnapshot(value: unknown): value is FahamQueueSnapshot {
  if (!isObjectRecord(value)) {
    return false;
  }

  const blockedReason = value.blockedReason;
  if (blockedReason !== null && blockedReason !== "due_backlog") {
    return false;
  }

  if (!Array.isArray(value.due) || !value.due.every(isSerializedFahamCardLike)) {
    return false;
  }

  if (!Array.isArray(value.learning) || !value.learning.every(isSerializedFahamCardLike)) {
    return false;
  }

  if (!Array.isArray(value.new) || !value.new.every(isSerializedFahamCardLike)) {
    return false;
  }

  if (!Array.isArray(value.mastered) || !value.mastered.every(isSerializedFahamCardLike)) {
    return false;
  }

  if (!isObjectRecord(value.levelProgress)) {
    return false;
  }

  if (
    !isFiniteNumber(value.levelProgress.activeLevel) ||
    !isFiniteNumber(value.levelProgress.activeWordLimit) ||
    !isFiniteNumber(value.levelProgress.maxLevel)
  ) {
    return false;
  }

  if (!isObjectRecord(value.stats)) {
    return false;
  }

  return (
    isFiniteNumber(value.stats.dueCount) &&
    isFiniteNumber(value.stats.eligibleNewCount) &&
    isFiniteNumber(value.stats.focusWordLimit) &&
    isFiniteNumber(value.stats.totalCandidateCount) &&
    isFiniteNumber(value.stats.masteredCount) &&
    isFiniteNumber(value.stats.learningCount)
  );
}

export function saveCachedFahamQueue(input: {
  directionMode: FahamMcqDirectionMode;
  meaningLocale: FahamMeaningLocale;
  isRevision: boolean;
  preset: FahamSourcePreset;
  snapshot: FahamQueueSnapshot;
}): void {
  const storage = getOfflineStorage();
  if (!storage) {
    return;
  }

  const payload: CachedFahamQueue = {
    directionMode: input.directionMode,
    meaningLocale: input.meaningLocale,
    isRevision: input.isRevision,
    preset: input.preset,
    savedAt: Date.now(),
    snapshot: input.snapshot,
  };

  try {
    storage.setItem(LS_KEY_QUEUE_CACHE, JSON.stringify(payload));
  } catch {
    // Ignore storage quota/availability issues.
  }
}

export function loadCachedFahamQueue(): CachedFahamQueue | null {
  const storage = getOfflineStorage();
  if (!storage) {
    return null;
  }

  const raw = storage.getItem(LS_KEY_QUEUE_CACHE);
  if (!raw) {
    return null;
  }

  const parsed = parseJson(raw);
  if (!isObjectRecord(parsed)) {
    return null;
  }

  const directionMode = parsed.directionMode;
  const meaningLocale = parsed.meaningLocale;
  const isRevision = parsed.isRevision;
  const preset = parsed.preset;
  const savedAt = parsed.savedAt;
  const snapshot = parsed.snapshot;

  if (
    (directionMode !== "arab_to_bm" &&
      directionMode !== "bm_to_arab" &&
      directionMode !== "mixed") ||
    (meaningLocale !== "ms" && meaningLocale !== "en") ||
    typeof isRevision !== "boolean" ||
    (preset !== "mixed" &&
      preset !== "reading" &&
      preset !== "theme" &&
      preset !== "hifz") ||
    typeof savedAt !== "number" ||
    !Number.isFinite(savedAt) ||
    !isFahamQueueSnapshot(snapshot)
  ) {
    return null;
  }

  return {
    directionMode,
    meaningLocale,
    isRevision,
    preset,
    savedAt,
    snapshot,
  };
}

function isCachedFahamStats(value: unknown): value is CachedFahamStats {
  if (!isObjectRecord(value)) {
    return false;
  }

  const wordBank = value.wordBank;
  const mastered = value.mastered;
  const learning = value.learning;
  const dueToday = value.dueToday;
  const retentionRate7d = value.retentionRate7d;
  const levelProgress = value.levelProgress;

  if (
    !Number.isFinite(wordBank) ||
    !Number.isFinite(mastered) ||
    !Number.isFinite(learning) ||
    !Number.isFinite(dueToday) ||
    !Number.isFinite(retentionRate7d)
  ) {
    return false;
  }

  if (levelProgress === undefined) {
    return true;
  }

  return isObjectRecord(levelProgress);
}

export function saveCachedFahamStats(stats: CachedFahamStats): void {
  const storage = getOfflineStorage();
  if (!storage) {
    return;
  }

  const payload: CachedStatsEnvelope = {
    savedAt: Date.now(),
    stats,
  };

  try {
    storage.setItem(LS_KEY_STATS_CACHE, JSON.stringify(payload));
  } catch {
    // Ignore storage quota/availability issues.
  }
}

export function loadCachedFahamStats(): CachedStatsEnvelope | null {
  const storage = getOfflineStorage();
  if (!storage) {
    return null;
  }

  const raw = storage.getItem(LS_KEY_STATS_CACHE);
  if (!raw) {
    return null;
  }

  const parsed = parseJson(raw);
  if (!isObjectRecord(parsed)) {
    return null;
  }

  const savedAt = parsed.savedAt;
  const stats = parsed.stats;

  if (
    typeof savedAt !== "number" ||
    !Number.isFinite(savedAt) ||
    !isCachedFahamStats(stats)
  ) {
    return null;
  }

  return {
    savedAt,
    stats,
  };
}
