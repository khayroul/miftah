/**
 * Client-side session queue for hifz flows.
 * Stores the current memorization or review queue in localStorage
 * so it survives page-to-page navigation and tab closes (24h expiry).
 */

export type HifzFlowType = "memorize" | "review";
export type HifzBlock = "sabak" | "sabqi" | "manzil";

export interface HifzQueueItem {
  progressId: number;
  ayahId: number;
  ayahKey: string;
  pageNumber: number;
  block: HifzBlock;
}

export interface HifzSessionQueue {
  type: HifzFlowType;
  items: HifzQueueItem[];
  pageOrder: number[];
  currentPageIndex: number;
  rated: number[]; // progressIds already rated this session
  savedAt?: number; // Unix timestamp for expiry
}

export interface HifzQueuePagePointer {
  index: number;
  pageNumber: number;
}

const STORAGE_PREFIX = "miftah:hifz:queue:";

function storageKey(type: HifzFlowType): string {
  return `${STORAGE_PREFIX}${type}`;
}

const QUEUE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
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

export function findQueuePageIndex(
  queue: Pick<HifzSessionQueue, "pageOrder">,
  pageNumber: number,
): number {
  return queue.pageOrder.indexOf(pageNumber);
}

export function getAdjacentQueuePageFromQueue(
  queue: Pick<HifzSessionQueue, "pageOrder">,
  pageNumber: number,
  direction: -1 | 1,
): HifzQueuePagePointer | null {
  const currentIndex = findQueuePageIndex(queue, pageNumber);
  if (currentIndex === -1) {
    return null;
  }

  const nextIndex = currentIndex + direction;
  const nextPageNumber = queue.pageOrder[nextIndex];
  if (nextPageNumber === undefined) {
    return null;
  }

  return {
    index: nextIndex,
    pageNumber: nextPageNumber,
  };
}

export function buildQueuePageHref(
  type: HifzFlowType,
  pageNumber: number,
  index: number,
): string {
  return `/read/${pageNumber}?flow=${type}&qi=${index}`;
}

export function buildRecoveredRatedProgressIds(
  items: HifzQueueItem[],
  pageOrder: number[],
  currentPageIndex: number,
): number[] {
  if (currentPageIndex <= 0) {
    return [];
  }

  const completedPages = new Set(pageOrder.slice(0, currentPageIndex));
  return items
    .filter((item) => completedPages.has(item.pageNumber))
    .map((item) => item.progressId);
}

export function saveQueueState(
  type: HifzFlowType,
  items: HifzQueueItem[],
  currentPageIndex = 0,
  rated: number[] = [],
): HifzSessionQueue | null {
  const storage = getStorage();
  if (!storage) return null;

  const queue: HifzSessionQueue = {
    type,
    items,
    pageOrder: groupItemsByPage(items),
    currentPageIndex,
    rated,
    savedAt: Date.now(),
  };

  if (currentPageIndex < 0 || currentPageIndex >= queue.pageOrder.length) {
    return null;
  }

  try {
    storage.setItem(storageKey(type), JSON.stringify(queue));
    return queue;
  } catch {
    return null;
  }
}

export function saveQueue(type: HifzFlowType, items: HifzQueueItem[]): HifzSessionQueue | null {
  return saveQueueState(type, items, 0, []);
}

export function loadQueue(type: HifzFlowType): HifzSessionQueue | null {
  const storage = getStorage();
  if (!storage) return null;

  try {
    const raw = storage.getItem(storageKey(type));
    if (!raw) return null;
    const queue = JSON.parse(raw) as HifzSessionQueue;
    if (queue.savedAt && Date.now() - queue.savedAt > QUEUE_EXPIRY_MS) {
      storage.removeItem(storageKey(type));
      return null;
    }
    return queue;
  } catch {
    return null;
  }
}

export function setCurrentPageIndex(
  type: HifzFlowType,
  index: number,
): HifzSessionQueue | null {
  const queue = loadQueue(type);
  if (!queue || index < 0 || index >= queue.pageOrder.length) {
    return null;
  }

  const updated: HifzSessionQueue = {
    ...queue,
    currentPageIndex: index,
    savedAt: Date.now(),
  };

  const storage = getStorage();
  if (!storage) return null;

  try {
    storage.setItem(storageKey(type), JSON.stringify(updated));
    return updated;
  } catch {
    return null;
  }
}

export function recoverQueueState(
  type: HifzFlowType,
  pageNumber: number,
  requestedPageIndex: number | null = null,
): HifzSessionQueue | null {
  const queue = loadQueue(type);
  if (!queue) {
    return null;
  }

  const requestedIndexIsValid =
    Number.isInteger(requestedPageIndex) &&
    requestedPageIndex !== null &&
    requestedPageIndex >= 0 &&
    requestedPageIndex < queue.pageOrder.length &&
    queue.pageOrder[requestedPageIndex] === pageNumber;
  const resolvedPageIndex = requestedIndexIsValid
    ? requestedPageIndex
    : findQueuePageIndex(queue, pageNumber);

  if (resolvedPageIndex === -1) {
    return queue;
  }

  const recoveredPageIndex = Math.max(queue.currentPageIndex, resolvedPageIndex);
  const recoveredRated = [
    ...new Set([
      ...queue.rated,
      ...buildRecoveredRatedProgressIds(
        queue.items,
        queue.pageOrder,
        recoveredPageIndex,
      ),
    ]),
  ];

  const queueAlreadyRecovered =
    queue.currentPageIndex === recoveredPageIndex &&
    queue.rated.length === recoveredRated.length &&
    queue.rated.every((progressId) => recoveredRated.includes(progressId));
  if (queueAlreadyRecovered) {
    return queue;
  }

  const updated: HifzSessionQueue = {
    ...queue,
    currentPageIndex: recoveredPageIndex,
    rated: recoveredRated,
    savedAt: Date.now(),
  };

  const storage = getStorage();
  if (!storage) {
    return null;
  }

  try {
    storage.setItem(storageKey(type), JSON.stringify(updated));
    return updated;
  } catch {
    return null;
  }
}

export function getQueuePagePointer(
  type: HifzFlowType,
  pageNumber: number,
): HifzQueuePagePointer | null {
  const queue = loadQueue(type);
  if (!queue) {
    return null;
  }

  const index = findQueuePageIndex(queue, pageNumber);
  if (index === -1) {
    return null;
  }

  return {
    index,
    pageNumber,
  };
}

export function advanceQueue(type: HifzFlowType): HifzSessionQueue | null {
  const queue = loadQueue(type);
  if (!queue) return null;

  const updated: HifzSessionQueue = {
    ...queue,
    currentPageIndex: queue.currentPageIndex + 1,
    savedAt: Date.now(),
  };

  const storage = getStorage();
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
    savedAt: Date.now(),
  };

  const storage = getStorage();
  if (!storage) return null;

  try {
    storage.setItem(storageKey(type), JSON.stringify(updated));
    return updated;
  } catch {
    return null;
  }
}

export function clearQueue(type: HifzFlowType): void {
  const storage = getStorage();
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

export function areAllProgressIdsRated(
  queue: Pick<HifzSessionQueue, "rated">,
  progressIds: number[],
): boolean {
  if (progressIds.length === 0) {
    return false;
  }

  const ratedSet = new Set(queue.rated);
  return progressIds.every((progressId) => ratedSet.has(progressId));
}

export function isPageFullyRated(
  queue: HifzSessionQueue,
  pageNumber: number,
): boolean {
  const progressIds = getItemsForPage(queue, pageNumber).map((item) => item.progressId);
  return areAllProgressIdsRated(queue, progressIds);
}

export function isQueueComplete(queue: HifzSessionQueue): boolean {
  return queue.currentPageIndex >= queue.pageOrder.length;
}

export function currentPage(queue: HifzSessionQueue): number | null {
  if (isQueueComplete(queue)) return null;
  return queue.pageOrder[queue.currentPageIndex] ?? null;
}

export function getAdjacentQueuePage(
  type: HifzFlowType,
  pageNumber: number,
  direction: -1 | 1,
): HifzQueuePagePointer | null {
  const queue = loadQueue(type);
  if (!queue) {
    return null;
  }

  return getAdjacentQueuePageFromQueue(queue, pageNumber, direction);
}
