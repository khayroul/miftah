/**
 * Client-side session queue for hifz flows.
 * Stores the current memorization or review queue in sessionStorage
 * so it survives page-to-page navigation within the same tab.
 */

export type HifzFlowType = "memorize" | "review";
export type HifzBlock = "sabak" | "sabqi" | "manzil";

export interface HifzQueueItem {
  progressId: number;
  ayahId: number;
  pageNumber: number;
  block: HifzBlock;
}

export interface HifzSessionQueue {
  type: HifzFlowType;
  items: HifzQueueItem[];
  pageOrder: number[];
  currentPageIndex: number;
  rated: number[]; // progressIds already rated this session
}

const STORAGE_PREFIX = "miftah:hifz:queue:";

function storageKey(type: HifzFlowType): string {
  return `${STORAGE_PREFIX}${type}`;
}

function getSessionStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function groupItemsByPage(items: HifzQueueItem[]): number[] {
  const seen = new Set<number>();
  const pages: number[] = [];
  for (const item of items) {
    if (!seen.has(item.pageNumber)) {
      seen.add(item.pageNumber);
      pages.push(item.pageNumber);
    }
  }
  return pages;
}

export function saveQueue(type: HifzFlowType, items: HifzQueueItem[]): HifzSessionQueue | null {
  const storage = getSessionStorage();
  if (!storage) return null;

  const queue: HifzSessionQueue = {
    type,
    items,
    pageOrder: groupItemsByPage(items),
    currentPageIndex: 0,
    rated: [],
  };

  try {
    storage.setItem(storageKey(type), JSON.stringify(queue));
    return queue;
  } catch {
    return null;
  }
}

export function loadQueue(type: HifzFlowType): HifzSessionQueue | null {
  const storage = getSessionStorage();
  if (!storage) return null;

  try {
    const raw = storage.getItem(storageKey(type));
    if (!raw) return null;
    return JSON.parse(raw) as HifzSessionQueue;
  } catch {
    return null;
  }
}

export function advanceQueue(type: HifzFlowType): HifzSessionQueue | null {
  const queue = loadQueue(type);
  if (!queue) return null;

  const updated: HifzSessionQueue = {
    ...queue,
    currentPageIndex: queue.currentPageIndex + 1,
  };

  const storage = getSessionStorage();
  if (!storage) return null;

  try {
    storage.setItem(storageKey(type), JSON.stringify(updated));
    return updated;
  } catch {
    return null;
  }
}

export function markRated(type: HifzFlowType, progressIds: number[]): HifzSessionQueue | null {
  const queue = loadQueue(type);
  if (!queue) return null;

  const ratedSet = new Set([...queue.rated, ...progressIds]);
  const updated: HifzSessionQueue = {
    ...queue,
    rated: [...ratedSet],
  };

  const storage = getSessionStorage();
  if (!storage) return null;

  try {
    storage.setItem(storageKey(type), JSON.stringify(updated));
    return updated;
  } catch {
    return null;
  }
}

export function clearQueue(type: HifzFlowType): void {
  const storage = getSessionStorage();
  if (!storage) return;
  try {
    storage.removeItem(storageKey(type));
  } catch {
    // ignore
  }
}

export function getItemsForPage(queue: HifzSessionQueue, pageNumber: number): HifzQueueItem[] {
  return queue.items.filter((item) => item.pageNumber === pageNumber);
}

export function isQueueComplete(queue: HifzSessionQueue): boolean {
  return queue.currentPageIndex >= queue.pageOrder.length;
}

export function currentPage(queue: HifzSessionQueue): number | null {
  if (isQueueComplete(queue)) return null;
  return queue.pageOrder[queue.currentPageIndex] ?? null;
}
