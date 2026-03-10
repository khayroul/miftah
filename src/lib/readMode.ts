export type ReadMode = "read" | "study" | "hifz";

const STORAGE_KEY = "miftah.read.mode.v1";
const listeners = new Set<() => void>();

function isReadMode(value: unknown): value is ReadMode {
  return value === "read" || value === "study" || value === "hifz";
}

export function defaultReadMode(): ReadMode {
  return "read";
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

function emitChange(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function loadReadMode(storage: StorageLike | null = getStorage()): ReadMode {
  if (!storage) {
    return defaultReadMode();
  }

  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) {
      return defaultReadMode();
    }

    return isReadMode(raw) ? raw : defaultReadMode();
  } catch {
    return defaultReadMode();
  }
}

export function saveReadMode(
  mode: ReadMode,
  storage: StorageLike | null = getStorage(),
): boolean {
  if (!storage || !isReadMode(mode)) {
    return false;
  }

  try {
    storage.setItem(STORAGE_KEY, mode);
    emitChange();
    return true;
  } catch {
    return false;
  }
}

export function subscribeReadMode(listener: () => void): () => void {
  listeners.add(listener);

  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) {
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
