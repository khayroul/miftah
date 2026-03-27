import {
  CACHE_BUNDLE,
  CACHE_TEMA,
  LS_KEY_DOWNLOADED,
  clearMushafDownloaded,
  isMushafDownloaded,
  markMushafDownloaded,
  parseDownloadedMarker,
} from "./mushafStatus";
import {
  CACHE_DATA,
  CACHE_IMAGES,
  OFFLINE_SHELL_PATHS,
  TOTAL_ITEMS,
  TOTAL_PAGES,
  buildPageFontPath,
  buildReadRoutePath,
  buildTemaRoutePath,
} from "./offlineBundle";

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
  readonly completedItems: number;
  readonly totalItems: number;
};

type ProgressCallback = (progress: MushafDownloadProgress) => void;

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
): Promise<boolean> {
  const cache = await caches.open(cacheName);
  const existing = await cache.match(url);
  if (existing !== undefined) return false;

  const response = await fetch(url, { signal: controller.signal });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  await cache.put(url, response);
  return true;
}

async function fetchAndCacheWithRetry(
  url: string,
  cacheName: string,
  controller: AbortController,
  maxRetries = 2,
): Promise<boolean> {
  const delays = [1000, 3000]; // exponential backoff
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fetchAndCache(url, cacheName, controller);
    } catch (error) {
      if (controller.signal.aborted) throw error;
      if (attempt === maxRetries) throw error;
      await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
    }
  }

  return false;
}

function extractNextStaticAssetUrls(html: string): string[] {
  const matches = html.matchAll(
    /(?:href|src)=["'](\/_next\/static\/[^"'?#]+(?:\?[^"']*)?)["']/g,
  );

  return Array.from(new Set(Array.from(matches, ([, url]) => url)));
}

async function cacheExtractedStaticAssets(
  html: string,
  controller: AbortController,
): Promise<void> {
  for (const assetUrl of extractNextStaticAssetUrls(html)) {
    await fetchAndCacheWithRetry(assetUrl, CACHE_BUNDLE, controller);
  }
}

async function cacheRouteDocument(
  url: string,
  controller: AbortController,
): Promise<boolean> {
  const cache = await caches.open(CACHE_BUNDLE);
  const normalizedUrl = new URL(url, window.location.origin);
  const cacheKey = `${normalizedUrl.origin}${normalizedUrl.pathname}`;
  let response = await cache.match(cacheKey, { ignoreSearch: true });
  let inserted = false;

  if (!response) {
    const fetched = await fetch(url, { signal: controller.signal });
    if (!fetched.ok) {
      throw new Error(`Failed to fetch ${url}: ${fetched.status}`);
    }
    await cache.put(cacheKey, fetched.clone());
    response = fetched;
    inserted = true;
  }

  const html = await response.clone().text();
  await cacheExtractedStaticAssets(html, controller);
  return inserted;
}

async function cacheOfflineShellAssets(
  controller: AbortController,
): Promise<number> {
  let insertedCount = 0;

  for (const path of OFFLINE_SHELL_PATHS) {
    if (await fetchAndCacheWithRetry(path, CACHE_BUNDLE, controller)) {
      insertedCount += 1;
    }
  }

  if (await cacheRouteDocument("/", controller)) {
    insertedCount += 1;
  }

  return insertedCount;
}

async function cacheGlobalFonts(
  controller: AbortController,
): Promise<number> {
  let insertedCount = 0;

  for (const path of ["/fonts/sura_names.woff2", "/fonts/QCF_BSML.ttf"]) {
    if (await fetchAndCacheWithRetry(path, CACHE_BUNDLE, controller)) {
      insertedCount += 1;
    }
  }

  return insertedCount;
}

// ---------------------------------------------------------------------------
// Version migration
// ---------------------------------------------------------------------------

async function migrateIfVersionChanged(
  cdnAssetVersion: string,
  temaDataVersion: string | undefined,
): Promise<void> {
  const stored = localStorage.getItem(LS_KEY_DOWNLOADED);
  if (stored === null) return;

  const parsed = parseDownloadedMarker(stored);
  if (!parsed) {
    clearMushafDownloaded();
    return;
  }

  const storedCdn = parsed.cdnAssetVersion;
  const storedTema = parsed.temaDataVersion;

  if (storedCdn !== cdnAssetVersion) {
    await caches.delete(CACHE_IMAGES);
    await caches.delete(CACHE_DATA);
    await caches.delete(CACHE_BUNDLE);
    clearMushafDownloaded();
    return;
  }

  if (temaDataVersion !== undefined && storedTema !== temaDataVersion) {
    await caches.delete(CACHE_TEMA);
    clearMushafDownloaded();
    await caches.delete(CACHE_BUNDLE);
    return;
  }

  if (parsed.schemaVersion !== "2") {
    clearMushafDownloaded();
  }
}

// ---------------------------------------------------------------------------
// Storage quota check
// ---------------------------------------------------------------------------

const REQUIRED_BYTES = 260_000_000; // ~260 MB (mushaf + tema + routes + fonts)

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
): Promise<number> {
  const urls = buildPageAssetUrls(page, config);
  const results = await Promise.all([
    fetchAndCacheWithRetry(urls.webp, CACHE_IMAGES, controller),
    fetchAndCacheWithRetry(urls.manifest, CACHE_DATA, controller),
    fetchAndCacheWithRetry(urls.layout, CACHE_DATA, controller),
    fetchAndCacheWithRetry(urls.translation, CACHE_DATA, controller),
    fetchAndCacheWithRetry(buildPageFontPath(page), CACHE_BUNDLE, controller),
    cacheRouteDocument(buildReadRoutePath(page), controller),
  ]);

  return results.filter(Boolean).length;
}

async function downloadTemaBundle(
  surah: number,
  controller: AbortController,
): Promise<number> {
  const results = await Promise.all([
    fetchAndCacheWithRetry(`/api/tema/${surah}`, CACHE_TEMA, controller),
    cacheRouteDocument(buildTemaRoutePath(surah), controller),
  ]);

  return results.filter(Boolean).length;
}

export async function downloadMushaf(
  config: PwaConfig,
  onProgress?: ProgressCallback,
): Promise<void> {
  if (isDownloading) return; // concurrency guard
  isDownloading = true;

  const controller = new AbortController();
  activeController = controller;

  const temaDataVersion = config.temaDataVersion;

  try {
    // Version migration
    await migrateIfVersionChanged(config.cdnAssetVersion, temaDataVersion);
    const baselineStatus = await isMushafDownloaded(
      config.cdnAssetVersion,
      temaDataVersion ?? "1",
    );

    // Storage checks
    const hasQuota = await checkStorageQuota();
    if (!hasQuota) {
      throw new Error(
        "Ruang storan tidak mencukupi (~260 MB diperlukan)",
      );
    }
    await requestPersistentStorage();

    let completedItems = baselineStatus.progress.completedItems;
    onProgress?.({
      completedItems,
      totalItems: TOTAL_ITEMS,
    });

    completedItems += await cacheOfflineShellAssets(controller);
    onProgress?.({
      completedItems,
      totalItems: TOTAL_ITEMS,
    });

    // Phase 1: Download mushaf pages, page data, page fonts, and cached
    // reader documents so offline navigation can render a full page.
    for (let page = 1; page <= TOTAL_PAGES; page += 2) {
      if (controller.signal.aborted) break;

      const batch: Promise<number>[] = [
        downloadPage(page, config, controller),
      ];
      if (page + 1 <= TOTAL_PAGES) {
        batch.push(downloadPage(page + 1, config, controller));
      }

      const batchInserted = await Promise.all(batch);
      completedItems += batchInserted.reduce((sum, value) => sum + value, 0);

      onProgress?.({
        completedItems,
        totalItems: TOTAL_ITEMS,
      });
    }

    completedItems += await cacheGlobalFonts(controller);
    onProgress?.({
      completedItems,
      totalItems: TOTAL_ITEMS,
    });

    // Phase 2: Download tema data (114 surahs)
    if (config.temaDataVersion !== undefined) {
      for (let surah = 1; surah <= 114; surah += 2) {
        if (controller.signal.aborted) break;

        const batch: Promise<number>[] = [
          downloadTemaBundle(surah, controller),
        ];
        if (surah + 1 <= 114) {
          batch.push(downloadTemaBundle(surah + 1, controller));
        }

        const batchInserted = await Promise.all(batch);
        completedItems += batchInserted.reduce((sum, value) => sum + value, 0);

        onProgress?.({
          completedItems,
          totalItems: TOTAL_ITEMS,
        });
      }
    }

    if (!controller.signal.aborted && temaDataVersion !== undefined) {
      const finalStatus = await isMushafDownloaded(
        config.cdnAssetVersion,
        temaDataVersion,
      );

      if (finalStatus.state !== "complete") {
        throw new Error(
          "Muat turun belum lengkap. Cuba semula semasa sambungan stabil.",
        );
      }

      markMushafDownloaded(config.cdnAssetVersion, temaDataVersion);
    }
  } catch (error) {
    if (
      error instanceof DOMException &&
      error.name === "QuotaExceededError"
    ) {
      throw new Error(
        "Ruang storan tidak mencukupi (~260 MB diperlukan)",
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
