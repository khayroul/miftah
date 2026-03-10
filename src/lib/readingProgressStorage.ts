export interface ReadingBookmark {
  page: number;
  createdAt: string;
}

export interface ReadingProgressState {
  lastPage: number | null;
  lastReadAt: string | null;
  bookmarks: ReadingBookmark[];
}

const STORAGE_KEY = "miftah.reading.progress.v1";
const MAX_BOOKMARKS = 50;
const listeners = new Set<() => void>();
const EMPTY_READING_PROGRESS_STATE: ReadingProgressState = {
  lastPage: null,
  lastReadAt: null,
  bookmarks: [],
};
let snapshotInitialized = false;
let snapshotSerialized: string | null = null;
let snapshotState: ReadingProgressState = EMPTY_READING_PROGRESS_STATE;

function isValidPage(page: number): boolean {
  return Number.isInteger(page) && page >= 1 && page <= 604;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeBookmark(value: unknown): ReadingBookmark | null {
  if (!isRecord(value)) {
    return null;
  }

  const page = typeof value.page === "number" ? value.page : null;
  const createdAt =
    typeof value.createdAt === "string" && value.createdAt.length > 0
      ? value.createdAt
      : null;

  if (!page || !isValidPage(page) || !createdAt) {
    return null;
  }

  return { page, createdAt };
}

export function emptyReadingProgressState(): ReadingProgressState {
  return EMPTY_READING_PROGRESS_STATE;
}

function emitReadingProgressChange(): void {
  for (const listener of listeners) {
    listener();
  }
}

function setSnapshot(state: ReadingProgressState, serialized: string | null): void {
  snapshotState = state;
  snapshotSerialized = serialized;
  snapshotInitialized = true;
}

export function sanitizeReadingProgressState(raw: unknown): ReadingProgressState {
  if (!isRecord(raw)) {
    return emptyReadingProgressState();
  }

  const lastPage =
    typeof raw.lastPage === "number" && isValidPage(raw.lastPage)
      ? raw.lastPage
      : null;

  const lastReadAt =
    typeof raw.lastReadAt === "string" && raw.lastReadAt.length > 0
      ? raw.lastReadAt
      : null;

  const bookmarkInput = Array.isArray(raw.bookmarks) ? raw.bookmarks : [];
  const normalizedBookmarks = bookmarkInput
    .map(normalizeBookmark)
    .filter((bookmark): bookmark is ReadingBookmark => bookmark !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const uniqueByPage = new Map<number, ReadingBookmark>();
  for (const bookmark of normalizedBookmarks) {
    if (!uniqueByPage.has(bookmark.page)) {
      uniqueByPage.set(bookmark.page, bookmark);
    }
    if (uniqueByPage.size >= MAX_BOOKMARKS) {
      break;
    }
  }

  return {
    lastPage,
    lastReadAt,
    bookmarks: Array.from(uniqueByPage.values()),
  };
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function getStorage(): StorageLike | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadReadingProgress(storage: StorageLike | null = getStorage()): ReadingProgressState {
  if (!storage) {
    return emptyReadingProgressState();
  }

  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) {
      return emptyReadingProgressState();
    }

    return sanitizeReadingProgressState(JSON.parse(raw));
  } catch {
    return emptyReadingProgressState();
  }
}

export function getReadingProgressSnapshot(): ReadingProgressState {
  const storage = getStorage();
  if (!storage) {
    return emptyReadingProgressState();
  }

  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (snapshotInitialized && raw === snapshotSerialized) {
      return snapshotState;
    }

    if (!raw) {
      setSnapshot(emptyReadingProgressState(), null);
      return snapshotState;
    }

    const parsed = sanitizeReadingProgressState(JSON.parse(raw));
    setSnapshot(parsed, raw);
    return snapshotState;
  } catch {
    setSnapshot(emptyReadingProgressState(), null);
    return snapshotState;
  }
}

export function getReadingProgressServerSnapshot(): ReadingProgressState {
  return emptyReadingProgressState();
}

export function subscribeReadingProgress(listener: () => void): () => void {
  listeners.add(listener);

  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) {
      if (typeof event.newValue === "string") {
        try {
          const parsed = sanitizeReadingProgressState(JSON.parse(event.newValue));
          setSnapshot(parsed, event.newValue);
        } catch {
          setSnapshot(emptyReadingProgressState(), null);
        }
      } else {
        setSnapshot(emptyReadingProgressState(), null);
      }
      listener();
    }
  };

  if (typeof window !== "undefined") {
    window.addEventListener("storage", onStorage);
  }

  return () => {
    listeners.delete(listener);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", onStorage);
    }
  };
}

export function saveReadingProgress(
  state: ReadingProgressState,
  storage: StorageLike | null = getStorage(),
): boolean {
  if (!storage) {
    return false;
  }

  try {
    const normalizedState = sanitizeReadingProgressState(state);
    const serialized = JSON.stringify(normalizedState);
    storage.setItem(STORAGE_KEY, serialized);
    setSnapshot(normalizedState, serialized);
    emitReadingProgressChange();
    return true;
  } catch {
    return false;
  }
}

export function rememberLastReadPage(page: number): ReadingProgressState {
  const current = loadReadingProgress();
  if (!isValidPage(page)) {
    return current;
  }

  const nextState: ReadingProgressState = {
    ...current,
    lastPage: page,
    lastReadAt: new Date().toISOString(),
  };

  saveReadingProgress(nextState);
  return nextState;
}

export function toggleBookmark(page: number): ReadingProgressState {
  const current = loadReadingProgress();
  if (!isValidPage(page)) {
    return current;
  }

  const exists = current.bookmarks.some((bookmark) => bookmark.page === page);
  const nextBookmarks = exists
    ? current.bookmarks.filter((bookmark) => bookmark.page !== page)
    : [{ page, createdAt: new Date().toISOString() }, ...current.bookmarks]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, MAX_BOOKMARKS);

  const nextState: ReadingProgressState = {
    ...current,
    bookmarks: nextBookmarks,
  };

  saveReadingProgress(nextState);
  return nextState;
}

export function isPageBookmarked(state: ReadingProgressState, page: number): boolean {
  return state.bookmarks.some((bookmark) => bookmark.page === page);
}
