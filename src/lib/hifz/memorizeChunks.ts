import type { HifzQueueItem } from "@/lib/hifz/sessionQueue";

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
