"use client";

import type { FsrsRating } from "@/shared/types/database";
import { getOfflineStorage, isObjectRecord, parseJson } from "./offlineSyncStorage";

const LS_KEY_PENDING_RATINGS = "miftah:faham:pending-ratings:v1";

type FahamRating = Extract<FsrsRating, 1 | 2 | 3 | 4>;

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isRating(value: unknown): value is FahamRating {
  return value === 1 || value === 2 || value === 3 || value === 4;
}

export interface PendingFahamRating {
  id: string;
  queuedAt: number;
  rating: FahamRating;
  progressId?: number;
  wordId?: number;
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
  const storage = getOfflineStorage();
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
  const storage = getOfflineStorage();
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
