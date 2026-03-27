import {
  CACHE_BUNDLE,
  CACHE_DATA,
  CACHE_IMAGES,
  CACHE_TEMA,
  type OfflineBundleCounts,
  TOTAL_DATA_ENTRIES,
  TOTAL_FONT_ENTRIES,
  TOTAL_ITEMS,
  TOTAL_PAGES,
  TOTAL_ROUTE_ENTRIES,
  TOTAL_SHELL_ENTRIES,
  TOTAL_TEMA_ENTRIES,
  getCompletedItems,
  isBundleFontPath,
  isOfflineShellPath,
  isReadRoutePath,
  isTemaRoutePath,
} from "./offlineBundle";

export { CACHE_BUNDLE, CACHE_TEMA, TOTAL_ITEMS, TOTAL_PAGES };

export const LS_KEY_DOWNLOADED = "miftah:mushaf-downloaded";
const LS_KEY_DISMISSED = "miftah:mushaf-dismissed";
const LS_KEY_STARTED = "miftah:mushaf-download-started";

const DOWNLOAD_SCHEMA_VERSION = "2";

export interface OfflineBundleProgress extends OfflineBundleCounts {
  readonly completedItems: number;
  readonly totalItems: number;
  readonly appShellReady: boolean;
}

export type MushafStatus =
  | { readonly state: "complete"; readonly progress: OfflineBundleProgress }
  | { readonly state: "partial"; readonly progress: OfflineBundleProgress }
  | { readonly state: "none"; readonly progress: OfflineBundleProgress };

interface DownloadMarker {
  readonly cdnAssetVersion: string;
  readonly temaDataVersion: string;
  readonly schemaVersion: string;
}

function buildEmptyProgress(): OfflineBundleProgress {
  return {
    images: 0,
    data: 0,
    tema: 0,
    routes: 0,
    fonts: 0,
    shell: 0,
    staticAssets: 0,
    completedItems: 0,
    totalItems: TOTAL_ITEMS,
    appShellReady: false,
  };
}

function buildCompleteProgress(): OfflineBundleProgress {
  return {
    images: TOTAL_PAGES,
    data: TOTAL_DATA_ENTRIES,
    tema: TOTAL_TEMA_ENTRIES,
    routes: TOTAL_ROUTE_ENTRIES,
    fonts: TOTAL_FONT_ENTRIES,
    shell: TOTAL_SHELL_ENTRIES,
    staticAssets: 1,
    completedItems: TOTAL_ITEMS,
    totalItems: TOTAL_ITEMS,
    appShellReady: true,
  };
}

function toOfflineBundleProgress(
  counts: OfflineBundleCounts,
): OfflineBundleProgress {
  return {
    ...counts,
    completedItems: getCompletedItems(counts),
    totalItems: TOTAL_ITEMS,
    appShellReady: counts.staticAssets > 0,
  };
}

async function countCacheEntries(
  cacheName: string,
  predicate: (pathname: string, requestUrl: string) => boolean,
): Promise<number> {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();

  return keys.reduce((count, request) => {
    const pathname = new URL(request.url).pathname;
    return predicate(pathname, request.url) ? count + 1 : count;
  }, 0);
}

async function getOfflineBundleProgress(): Promise<OfflineBundleProgress> {
  try {
    const [images, data, tema, routes, fonts, shell, staticAssets] =
      await Promise.all([
        countCacheEntries(
          CACHE_IMAGES,
          (_pathname, requestUrl) => requestUrl.includes("_mobile.webp"),
        ),
        countCacheEntries(
          CACHE_DATA,
          (pathname) =>
            /(^|\/)page_\d{3}\.manifest\.json$/.test(pathname) ||
            /^\/layouts\/page-\d{3}\.json$/.test(pathname) ||
            /^\/translations\/page-\d{3}\.json$/.test(pathname),
        ),
        countCacheEntries(CACHE_TEMA, (pathname) => pathname.startsWith("/api/tema/")),
        countCacheEntries(
          CACHE_BUNDLE,
          (pathname) =>
            pathname === "/" ||
            isReadRoutePath(pathname) ||
            isTemaRoutePath(pathname),
        ),
        countCacheEntries(CACHE_BUNDLE, (pathname) => isBundleFontPath(pathname)),
        countCacheEntries(CACHE_BUNDLE, (pathname) => isOfflineShellPath(pathname)),
        countCacheEntries(CACHE_BUNDLE, (pathname) => pathname.startsWith("/_next/static/")),
      ]);

    return toOfflineBundleProgress({
      images,
      data,
      tema,
      routes,
      fonts,
      shell,
      staticAssets,
    });
  } catch {
    return buildEmptyProgress();
  }
}

export function buildDownloadedMarker(
  cdnAssetVersion: string,
  temaDataVersion: string,
): string {
  return `${cdnAssetVersion}:${temaDataVersion}:${DOWNLOAD_SCHEMA_VERSION}`;
}

export function parseDownloadedMarker(value: string): DownloadMarker | null {
  const [cdnAssetVersion, temaDataVersion, schemaVersion = "1"] = value.split(":");

  if (!cdnAssetVersion || !temaDataVersion) {
    return null;
  }

  return { cdnAssetVersion, temaDataVersion, schemaVersion };
}

/**
 * Checks whether the full mushaf has been downloaded.
 *
 * Fast path: localStorage flag matches the current composite version and bundle
 * schema → complete.
 * Slow path: count every required offline bucket directly from Cache Storage.
 */
export async function isMushafDownloaded(
  cdnAssetVersion: string,
  temaDataVersion: string,
): Promise<MushafStatus> {
  const expectedMarker = buildDownloadedMarker(cdnAssetVersion, temaDataVersion);

  // Fast path
  const stored = localStorage.getItem(LS_KEY_DOWNLOADED);
  if (stored === expectedMarker) {
    return {
      state: "complete",
      progress: buildCompleteProgress(),
    };
  }

  const progress = await getOfflineBundleProgress();

  if (
    progress.images >= TOTAL_PAGES &&
    progress.data >= TOTAL_DATA_ENTRIES &&
    progress.tema >= TOTAL_TEMA_ENTRIES &&
    progress.routes >= TOTAL_ROUTE_ENTRIES &&
    progress.fonts >= TOTAL_FONT_ENTRIES &&
    progress.shell >= TOTAL_SHELL_ENTRIES &&
    progress.appShellReady
  ) {
    markMushafDownloaded(cdnAssetVersion, temaDataVersion);
    return { state: "complete", progress };
  }

  if (progress.completedItems === 0 && !progress.appShellReady) {
    return { state: "none", progress };
  }

  return { state: "partial", progress };
}

/** Mark the mushaf as fully downloaded for the given asset version. */
export function markMushafDownloaded(
  cdnAssetVersion: string,
  temaDataVersion: string,
): void {
  localStorage.setItem(
    LS_KEY_DOWNLOADED,
    buildDownloadedMarker(cdnAssetVersion, temaDataVersion),
  );
}

/** Clear the downloaded flag (for version migration or debug). */
export function clearMushafDownloaded(): void {
  localStorage.removeItem(LS_KEY_DOWNLOADED);
  localStorage.removeItem(LS_KEY_STARTED);
}

/** Check if user previously tapped "Muat turun". */
export function hasUserStartedDownload(): boolean {
  return localStorage.getItem(LS_KEY_STARTED) === "true";
}

/** Record that the user tapped "Muat turun". */
export function setDownloadStarted(): void {
  localStorage.setItem(LS_KEY_STARTED, "true");
}

/** Check if user dismissed the prompt within the last 24 hours. */
export function isPromptDismissed(): boolean {
  const raw = localStorage.getItem(LS_KEY_DISMISSED);
  if (raw === null) return false;
  const timestamp = Number(raw);
  if (Number.isNaN(timestamp)) return false;
  const twentyFourHours = 24 * 60 * 60 * 1000;
  return Date.now() - timestamp < twentyFourHours;
}

/** Dismiss the download prompt for 24 hours. */
export function dismissPrompt(): void {
  localStorage.setItem(LS_KEY_DISMISSED, String(Date.now()));
}
