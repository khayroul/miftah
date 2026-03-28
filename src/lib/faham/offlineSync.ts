"use client";

import type { FahamLevelProgress } from "./levels";
import type { FahamMcqDirectionMode } from "./mcq";
import type { FahamQueueSnapshot } from "./queue";
import type { FahamSourcePreset } from "./presets";
import type { FsrsRating } from "@/types/database";

const LS_KEY_PENDING_RATINGS = "miftah:faham:pending-ratings:v1";
const LS_KEY_QUEUE_CACHE = "miftah:faham:queue-cache:v1";
const LS_KEY_STATS_CACHE = "miftah:faham:stats-cache:v1";

type FahamRating = Extract<FsrsRating, 1 | 2 | 3 | 4>;

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

export interface PendingFahamRating {
  id: string;
  queuedAt: number;
  rating: FahamRating;
  progressId?: number;
  wordId?: number;
}

export interface CachedFahamQueue {
  directionMode: FahamMcqDirectionMode;
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

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parseJson(raw: string): unknown | null {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function isRating(value: unknown): value is FahamRating {
  return value === 1 || value === 2 || value === 3 || value === 4;
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

function sanitizePendingRatings(value: unknown): PendingFahamRating[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const entries: PendingFahamRating[] = [];
  for (const raw of value) {
    if (!isObjectRecord(raw)) {
      continue;
    }

    const id = raw.id;
    const progressId = raw.progressId;
    const wordId = raw.wordId;
    const queuedAt = raw.queuedAt;
    const rating = raw.rating;
    const normalizedProgressId = isPositiveInteger(progressId) ? progressId : null;
    const normalizedWordId = isPositiveInteger(wordId) ? wordId : null;

    if (
      typeof id !== "string" ||
      typeof queuedAt !== "number" ||
      !Number.isFinite(queuedAt) ||
      queuedAt <= 0 ||
      !isRating(rating) ||
      (normalizedProgressId === null && normalizedWordId === null)
    ) {
      continue;
    }

    entries.push({
      id,
      queuedAt,
      rating,
      progressId: normalizedProgressId ?? undefined,
      wordId: normalizedWordId ?? undefined,
    });
  }

  return entries.sort((a, b) => a.queuedAt - b.queuedAt);
}

function persistPendingRatings(entries: PendingFahamRating[]): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  try {
    storage.setItem(LS_KEY_PENDING_RATINGS, JSON.stringify(entries));
  } catch {
    // Ignore storage quota/availability issues.
  }
}

export function loadPendingFahamRatings(): PendingFahamRating[] {
  const storage = getStorage();
  if (!storage) {
    return [];
  }

  const raw = storage.getItem(LS_KEY_PENDING_RATINGS);
  if (!raw) {
    return [];
  }

  const parsed = parseJson(raw);
  const sanitized = sanitizePendingRatings(parsed);
  if (sanitized.length === 0) {
    try {
      storage.removeItem(LS_KEY_PENDING_RATINGS);
    } catch {
      // Ignore storage failures.
    }
    return [];
  }

  if (sanitized.length !== (Array.isArray(parsed) ? parsed.length : 0)) {
    persistPendingRatings(sanitized);
  }

  return sanitized;
}

export function enqueuePendingFahamRating(input: {
  progressId?: number;
  rating: FahamRating;
  wordId?: number;
}): PendingFahamRating[] {
  const progressId = isPositiveInteger(input.progressId) ? input.progressId : null;
  const wordId = isPositiveInteger(input.wordId) ? input.wordId : null;
  if (progressId === null && wordId === null) {
    return loadPendingFahamRatings();
  }

  const nextEntry: PendingFahamRating = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    queuedAt: Date.now(),
    rating: input.rating,
    progressId: progressId ?? undefined,
    wordId: wordId ?? undefined,
  };

  const next = [...loadPendingFahamRatings(), nextEntry];
  persistPendingRatings(next);
  return next;
}

export function replacePendingFahamRatings(entries: PendingFahamRating[]): PendingFahamRating[] {
  const sanitized = sanitizePendingRatings(entries);
  persistPendingRatings(sanitized);
  return sanitized;
}

export function saveCachedFahamQueue(input: {
  directionMode: FahamMcqDirectionMode;
  isRevision: boolean;
  preset: FahamSourcePreset;
  snapshot: FahamQueueSnapshot;
}): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  const payload: CachedFahamQueue = {
    directionMode: input.directionMode,
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
  const storage = getStorage();
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
  const isRevision = parsed.isRevision;
  const preset = parsed.preset;
  const savedAt = parsed.savedAt;
  const snapshot = parsed.snapshot;

  if (
    (directionMode !== "arab_to_bm" &&
      directionMode !== "bm_to_arab" &&
      directionMode !== "mixed") ||
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

  if (!isObjectRecord(levelProgress)) {
    return false;
  }

  return true;
}

export function saveCachedFahamStats(stats: CachedFahamStats): void {
  const storage = getStorage();
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
  const storage = getStorage();
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
