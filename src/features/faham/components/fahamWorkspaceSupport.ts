import {
  loadCachedFahamQueue,
  saveCachedFahamQueue,
  type CachedFahamQueue,
} from "../domain/offlineSync";
import type { FahamLevelProgress } from "../domain/levels";
import type { FahamMcqDirectionMode } from "../domain/mcq";
import { FAHAM_PRESET_CONFIGS, type FahamSourcePreset } from "../domain/presets";
import type { FahamQueueSnapshot, SerializedFahamCard } from "../domain/queue";

// Generous budgets: a Vercel cold start + mobile RTT can exceed the old
// 2.5s/4s limits, and an early abort strands the workspace on placeholder
// dots / missing session cards with no error shown (2026-07-15 field bug,
// operator iPhone). The aborts exist only to prevent an infinite hang.
const FAHAM_QUEUE_REQUEST_TIMEOUT_MS = 12000;
const FAHAM_STATS_REQUEST_TIMEOUT_MS = 12000;

function hashForShuffle(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function shuffleSegment(cards: SerializedFahamCard[]): SerializedFahamCard[] {
  if (cards.length <= 1) return cards;
  const today = new Date().toISOString().slice(0, 10);
  return [...cards].sort(
    (a, b) =>
      hashForShuffle(`${today}:${a.word.id}`) -
      hashForShuffle(`${today}:${b.word.id}`),
  );
}

export function queueItems(
  snapshot: FahamQueueSnapshot,
): SerializedFahamCard[] {
  return [
    ...shuffleSegment(snapshot.due),
    ...shuffleSegment(snapshot.learning),
    ...shuffleSegment(snapshot.new),
    ...shuffleSegment(snapshot.mastered),
  ];
}

export function countQueueCards(snapshot: FahamQueueSnapshot): number {
  return (
    snapshot.due.length +
    snapshot.learning.length +
    snapshot.new.length +
    snapshot.mastered.length
  );
}

export function isRestorableFahamQueue(snapshot: FahamQueueSnapshot): boolean {
  const cards = [
    ...snapshot.due,
    ...snapshot.learning,
    ...snapshot.new,
    ...snapshot.mastered,
  ];
  // Empty bootstrap snapshots and signed-out preview cards are not sessions.
  // Restoring either one hides the loading state without giving the learner a
  // usable deck.
  return cards.length > 0 && cards.every((card) => card.word.id > 0);
}

export function saveRestorableCachedQueue(input: {
  directionMode: FahamMcqDirectionMode;
  isRevision: boolean;
  preset: FahamSourcePreset;
  snapshot: FahamQueueSnapshot;
}): boolean {
  if (!isRestorableFahamQueue(input.snapshot)) return false;
  saveCachedFahamQueue(input);
  return true;
}

export function loadMatchingCachedQueue(expected?: {
  directionMode: FahamMcqDirectionMode;
  isRevision: boolean;
  preset: FahamSourcePreset;
}): CachedFahamQueue | null {
  const cachedQueue = loadCachedFahamQueue();
  if (!cachedQueue || !isRestorableFahamQueue(cachedQueue.snapshot)) return null;
  if (!expected) return cachedQueue;
  return cachedQueue.directionMode === expected.directionMode &&
    cachedQueue.isRevision === expected.isRevision &&
    cachedQueue.preset === expected.preset
    ? cachedQueue
    : null;
}

export async function requestQueue(
  preset: FahamSourcePreset,
  directionMode: FahamMcqDirectionMode,
  isRevision = false,
  timeoutMs = FAHAM_QUEUE_REQUEST_TIMEOUT_MS,
): Promise<FahamQueueSnapshot> {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch("/api/faham/queue", {
      body: JSON.stringify({
        directionMode,
        preferredSources: FAHAM_PRESET_CONFIGS[preset].preferredSources,
        isRevision,
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
      signal: controller.signal,
    });
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
  if (!response.ok) throw new Error("Failed to fetch Faham queue");
  return (await response.json()) as FahamQueueSnapshot;
}

export interface FahamStats {
  wordBank: number;
  mastered: number;
  learning: number;
  dueToday: number;
  retentionRate7d: number;
  levelProgress?: FahamLevelProgress;
}

export async function requestStats(
  timeoutMs = FAHAM_STATS_REQUEST_TIMEOUT_MS,
): Promise<FahamStats> {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch("/api/faham/stats", { signal: controller.signal });
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
  if (!response.ok) throw new Error("Failed to fetch Faham stats");
  return (await response.json()) as FahamStats;
}
