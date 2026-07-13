import type { HifzQueueItem } from "./sessionQueue";

export type MemorizeChunkSizeOption = "auto" | 1 | 2 | 3;

export interface MemorizeChunk {
  index: number;
  items: HifzQueueItem[];
  ayahKeys: string[];
}

export function resolveMemorizeChunkLength(
  itemCount: number,
  chunkSize: MemorizeChunkSizeOption,
): number {
  if (chunkSize !== "auto") {
    return chunkSize;
  }

  if (itemCount <= 3) {
    return 1;
  }

  if (itemCount <= 6) {
    return 2;
  }

  return 3;
}

export function buildMemorizeChunks(
  items: HifzQueueItem[],
  chunkSize: MemorizeChunkSizeOption,
): MemorizeChunk[] {
  if (items.length === 0) {
    return [];
  }

  const chunkLength = Math.max(
    1,
    resolveMemorizeChunkLength(items.length, chunkSize),
  );
  const chunks: MemorizeChunk[] = [];

  for (let start = 0; start < items.length; start += chunkLength) {
    const chunkItems = items.slice(start, start + chunkLength);
    chunks.push({
      index: chunks.length,
      items: chunkItems,
      ayahKeys: chunkItems
        .map((item) => item.ayahKey)
        .filter((ayahKey): ayahKey is string => ayahKey.length > 0),
    });
  }

  return chunks;
}

// --- Adaptive chunk sizing ---

const CHUNK_RATINGS_KEY = "miftah:hifz:chunk-ratings";
const MAX_RATINGS = 10;

export type ChunkSizeSuggestion = "smaller" | "larger" | null;

function getChunkRatings(): boolean[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CHUNK_RATINGS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is boolean => typeof v === "boolean") : [];
  } catch {
    return [];
  }
}

export function recordChunkRating(confident: boolean): void {
  if (typeof window === "undefined") return;
  const ratings = getChunkRatings();
  const updated = [...ratings, confident].slice(-MAX_RATINGS);
  window.localStorage.setItem(CHUNK_RATINGS_KEY, JSON.stringify(updated));
}

export function getChunkSizeSuggestion(): ChunkSizeSuggestion {
  const ratings = getChunkRatings();
  if (ratings.length < 3) return null;

  // Check last 3 — all not confident → suggest smaller
  const lastThree = ratings.slice(-3);
  if (lastThree.every((r) => !r)) return "smaller";

  // Check last 5 — all confident → suggest larger
  if (ratings.length >= 5) {
    const lastFive = ratings.slice(-5);
    if (lastFive.every((r) => r)) return "larger";
  }

  return null;
}

export function clearChunkRatings(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(CHUNK_RATINGS_KEY);
}
