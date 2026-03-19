const DB_NAME = "miftah-pwa";
const DB_VERSION = 1;
const STORE_SURAH_PACKS = "surahPacks";
const STORE_DOWNLOAD_HISTORY = "downloadHistory";
const HISTORY_STORAGE_KEY = "miftah.download.history.v1";

export interface SurahPack {
  readonly surahId: number;
  readonly status: "pending" | "downloading" | "complete" | "error";
  readonly pageRange: readonly [number, number];
  readonly totalPages: number;
  readonly downloadedPages: number;
  readonly totalSizeBytes: number;
  readonly assetVersion: string;
  readonly downloadedAt: string | null;
  readonly errorMessage: string | null;
}

export interface DownloadHistoryEntry {
  readonly surahId: number;
  readonly lastDownloadedAt: string;
}

// Pure functions

export function createEmptyPack(
  surahId: number,
  pageRange: [number, number]
): SurahPack {
  const [start, end] = pageRange;
  return {
    surahId,
    status: "pending",
    pageRange: [start, end],
    totalPages: end - start + 1,
    downloadedPages: 0,
    totalSizeBytes: 0,
    assetVersion: "",
    downloadedAt: null,
    errorMessage: null,
  };
}

export function updatePackStatus(
  pack: SurahPack,
  updates: Partial<
    Pick<
      SurahPack,
      | "status"
      | "downloadedPages"
      | "totalSizeBytes"
      | "assetVersion"
      | "errorMessage"
    >
  >
): SurahPack {
  const downloadedAt =
    updates.status === "complete" ? new Date().toISOString() : pack.downloadedAt;

  return {
    ...pack,
    ...updates,
    downloadedAt,
  };
}

// IndexedDB operations (browser-only)

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_SURAH_PACKS)) {
        db.createObjectStore(STORE_SURAH_PACKS, { keyPath: "surahId" });
      }
      if (!db.objectStoreNames.contains(STORE_DOWNLOAD_HISTORY)) {
        db.createObjectStore(STORE_DOWNLOAD_HISTORY, { keyPath: "surahId" });
      }
    };

    request.onsuccess = (event) => {
      resolve((event.target as IDBOpenDBRequest).result);
    };

    request.onerror = (event) => {
      reject((event.target as IDBOpenDBRequest).error);
    };
  });
}

export async function getPack(surahId: number): Promise<SurahPack | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SURAH_PACKS, "readonly");
    const store = tx.objectStore(STORE_SURAH_PACKS);
    const request = store.get(surahId);

    request.onsuccess = (event) => {
      resolve((event.target as IDBRequest<SurahPack | undefined>).result);
    };

    request.onerror = (event) => {
      reject((event.target as IDBRequest).error);
    };
  });
}

export async function savePack(pack: SurahPack): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SURAH_PACKS, "readwrite");
    const store = tx.objectStore(STORE_SURAH_PACKS);
    const request = store.put(pack);

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = (event) => {
      reject((event.target as IDBRequest).error);
    };
  });
}

export async function getAllPacks(): Promise<SurahPack[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SURAH_PACKS, "readonly");
    const store = tx.objectStore(STORE_SURAH_PACKS);
    const request = store.getAll();

    request.onsuccess = (event) => {
      resolve((event.target as IDBRequest<SurahPack[]>).result);
    };

    request.onerror = (event) => {
      reject((event.target as IDBRequest).error);
    };
  });
}

export async function recordDownloadHistory(surahId: number): Promise<void> {
  const lastDownloadedAt = new Date().toISOString();
  const entry: DownloadHistoryEntry = { surahId, lastDownloadedAt };

  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_DOWNLOAD_HISTORY, "readwrite");
    const store = tx.objectStore(STORE_DOWNLOAD_HISTORY);
    const request = store.put(entry);

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = (event) => {
      reject((event.target as IDBRequest).error);
    };
  });

  const existing = getDownloadHistoryFromLocalStorage();
  const updated = existing.includes(surahId)
    ? existing
    : [...existing, surahId];
  localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(updated));
}

export function getDownloadHistoryFromLocalStorage(): number[] {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is number => typeof item === "number");
  } catch {
    return [];
  }
}
