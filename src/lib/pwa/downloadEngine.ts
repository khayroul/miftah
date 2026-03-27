import {
  TOTAL_PAGES,
  LS_KEY_DOWNLOADED,
  markMushafDownloaded,
  clearMushafDownloaded,
} from "./mushafStatus";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface PwaConfig {
  readonly cdnAssetVersion: string;
  readonly temaDataVersion?: string;
  readonly supabaseStorageBase: string;
  readonly pagesBucket: string;
  readonly manifestsBucket: string;
}

let cachedConfig: PwaConfig | null = null;

export async function loadPwaConfig(): Promise<PwaConfig> {
  if (cachedConfig !== null) return cachedConfig;

  const response = await fetch("/pwa-config.json");
  if (!response.ok) {
    throw new Error(`Failed to load pwa-config.json: ${response.status}`);
  }

  const data: unknown = await response.json();
  if (!isPwaConfig(data)) {
    throw new Error("Invalid pwa-config.json: missing required fields");
  }
  if (!data.supabaseStorageBase) {
    throw new Error(
      "pwa-config.json has an empty supabaseStorageBase. Set NEXT_PUBLIC_SUPABASE_URL and rebuild.",
    );
  }

  cachedConfig = data;
  return data;
}

function isPwaConfig(value: unknown): value is PwaConfig {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.cdnAssetVersion === "string" &&
    typeof v.supabaseStorageBase === "string" &&
    typeof v.pagesBucket === "string" &&
    typeof v.manifestsBucket === "string"
  );
}

// ---------------------------------------------------------------------------
// URL construction
// ---------------------------------------------------------------------------

export interface PageAssetUrls {
  readonly webp: string;
  readonly manifest: string;
  readonly layout: string;
  readonly translation: string;
}

function zeroPad(n: number, digits = 3): string {
  return String(n).padStart(digits, "0");
}

export function buildPageAssetUrls(
  pageNumber: number,
  config: PwaConfig,
): PageAssetUrls {
  const padded = zeroPad(pageNumber);
  const base = config.supabaseStorageBase;
  const v = config.cdnAssetVersion;

  return {
    webp: `${base}/${config.pagesBucket}/page_${padded}_mobile.webp?v=${v}`,
    manifest: `${base}/${config.manifestsBucket}/page_${padded}.manifest.json?v=${v}`,
    layout: `/layouts/page-${padded}.json`,
    translation: `/translations/page-${padded}.json`,
  };
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

export type MushafDownloadProgress = {
  readonly downloadedPages: number;
  readonly totalPages: number;
};

type ProgressCallback = (progress: MushafDownloadProgress) => void;

// ---------------------------------------------------------------------------
// Cache names
// ---------------------------------------------------------------------------

const CACHE_IMAGES = "mushaf-images-v1";
const CACHE_DATA = "mushaf-data-v1";

// ---------------------------------------------------------------------------
// Cancellation
// ---------------------------------------------------------------------------

let activeController: AbortController | null = null;

export function cancelDownload(): void {
  if (activeController !== null) {
    activeController.abort();
    activeController = null;
  }
}

// ---------------------------------------------------------------------------
// Concurrency guard
// ---------------------------------------------------------------------------

let isDownloading = false;

// ---------------------------------------------------------------------------
// Fetch with retry
// ---------------------------------------------------------------------------

async function fetchAndCache(
  url: string,
  cacheName: string,
  controller: AbortController,
): Promise<void> {
  const cache = await caches.open(cacheName);
  const existing = await cache.match(url);
  if (existing !== undefined) return; // already cached — skip

  const response = await fetch(url, { signal: controller.signal });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  await cache.put(url, response);
}

async function fetchAndCacheWithRetry(
  url: string,
  cacheName: string,
  controller: AbortController,
  maxRetries = 2,
): Promise<void> {
  const delays = [1000, 3000]; // exponential backoff
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      await fetchAndCache(url, cacheName, controller);
      return;
    } catch (error) {
      if (controller.signal.aborted) throw error;
      if (attempt === maxRetries) throw error;
      await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
    }
  }
}

// ---------------------------------------------------------------------------
// Version migration
// ---------------------------------------------------------------------------

async function migrateIfVersionChanged(
  currentVersion: string,
): Promise<void> {
  const stored = localStorage.getItem(LS_KEY_DOWNLOADED);
  if (stored !== null && stored !== currentVersion) {
    // Version mismatch — clear old caches
    await caches.delete(CACHE_IMAGES);
    await caches.delete(CACHE_DATA);
    clearMushafDownloaded();
  }
}

// ---------------------------------------------------------------------------
// Storage quota check
// ---------------------------------------------------------------------------

const REQUIRED_BYTES = 150_000_000; // ~150 MB

async function checkStorageQuota(): Promise<boolean> {
  if (!navigator.storage?.estimate) return true; // can't check, proceed optimistically
  const estimate = await navigator.storage.estimate();
  const available = (estimate.quota ?? 0) - (estimate.usage ?? 0);
  return available >= REQUIRED_BYTES;
}

async function requestPersistentStorage(): Promise<void> {
  if (navigator.storage?.persist) {
    await navigator.storage.persist();
  }
}

// ---------------------------------------------------------------------------
// Download engine
// ---------------------------------------------------------------------------

async function downloadPage(
  page: number,
  config: PwaConfig,
  controller: AbortController,
): Promise<void> {
  const urls = buildPageAssetUrls(page, config);
  await Promise.all([
    fetchAndCacheWithRetry(urls.webp, CACHE_IMAGES, controller),
    fetchAndCacheWithRetry(urls.manifest, CACHE_DATA, controller),
    fetchAndCacheWithRetry(urls.layout, CACHE_DATA, controller),
    fetchAndCacheWithRetry(urls.translation, CACHE_DATA, controller),
  ]);
}

export async function downloadMushaf(
  config: PwaConfig,
  onProgress?: ProgressCallback,
): Promise<void> {
  if (isDownloading) return; // concurrency guard
  isDownloading = true;

  const controller = new AbortController();
  activeController = controller;

  try {
    // Version migration
    await migrateIfVersionChanged(config.cdnAssetVersion);

    // Storage checks
    const hasQuota = await checkStorageQuota();
    if (!hasQuota) {
      throw new Error(
        "Ruang storan tidak mencukupi (~150 MB diperlukan)",
      );
    }
    await requestPersistentStorage();

    // Download pages in batches of 2
    let completedPages = 0;

    for (let page = 1; page <= TOTAL_PAGES; page += 2) {
      if (controller.signal.aborted) break;

      const batch: Promise<void>[] = [
        downloadPage(page, config, controller),
      ];
      if (page + 1 <= TOTAL_PAGES) {
        batch.push(downloadPage(page + 1, config, controller));
      }

      await Promise.all(batch);

      const pagesInBatch = page + 1 <= TOTAL_PAGES ? 2 : 1;
      completedPages += pagesInBatch;

      onProgress?.({
        downloadedPages: completedPages,
        totalPages: TOTAL_PAGES,
      });
    }

    if (!controller.signal.aborted) {
      markMushafDownloaded(config.cdnAssetVersion);
    }
  } catch (error) {
    if (
      error instanceof DOMException &&
      error.name === "QuotaExceededError"
    ) {
      throw new Error(
        "Ruang storan tidak mencukupi (~150 MB diperlukan)",
      );
    }
    throw error;
  } finally {
    isDownloading = false;
    if (activeController === controller) {
      activeController = null;
    }
  }
}
