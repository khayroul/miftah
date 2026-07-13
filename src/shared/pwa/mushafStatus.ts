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
export const LS_KEY_PACKAGE_CHECKPOINT = "miftah:mushaf-download-package";
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
  readonly appBuildId: string;
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

function toOfflineBundleProgress(
  counts: OfflineBundleCounts,
): OfflineBundleProgress {
  const normalizedCounts: OfflineBundleCounts = {
    images: Math.min(counts.images, TOTAL_PAGES),
    data: Math.min(counts.data, TOTAL_DATA_ENTRIES),
    tema: Math.min(counts.tema, TOTAL_TEMA_ENTRIES),
    routes: Math.min(counts.routes, TOTAL_ROUTE_ENTRIES),
    fonts: Math.min(counts.fonts, TOTAL_FONT_ENTRIES),
    shell: Math.min(counts.shell, TOTAL_SHELL_ENTRIES),
    staticAssets: counts.staticAssets,
  };

  return {
    ...normalizedCounts,
    completedItems: getCompletedItems(normalizedCounts),
    totalItems: TOTAL_ITEMS,
    appShellReady: normalizedCounts.staticAssets > 0,
  };
}

function extractTemaSurahFromPath(pathname: string): number | null {
  const match = pathname.match(/^\/api\/tema\/(\d+)$/);
  if (!match) return null;

  const surah = Number(match[1]);
  if (!Number.isInteger(surah)) return null;
  if (surah < 1 || surah > TOTAL_TEMA_ENTRIES) return null;

  return surah;
}

function isTemaApiPath(pathname: string): boolean {
  return extractTemaSurahFromPath(pathname) !== null;
}

function isTemaRoutePathInRange(pathname: string): boolean {
  if (!isTemaRoutePath(pathname)) return false;

  const match = pathname.match(/^\/read\/surah\/(\d+)\/themes$/);
  if (!match) return false;

  const surah = Number(match[1]);
  if (!Number.isInteger(surah)) return false;
  return surah >= 1 && surah <= TOTAL_TEMA_ENTRIES;
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
          (pathname, requestUrl) => {
            if (requestUrl.includes("_mobile.webp")) {
              return true;
            }
            if (!/^\/api\/mushaf\/page\/\d+$/.test(pathname)) {
              return false;
            }
            return new URL(requestUrl).searchParams.get("variant") === "mobile";
          },
        ),
        countCacheEntries(
          CACHE_DATA,
          (pathname) =>
            /(^|\/)page_\d{3}\.manifest\.json$/.test(pathname) ||
            /^\/api\/mushaf\/manifest\/\d+$/.test(pathname) ||
            /^\/layouts\/page-\d{3}\.json$/.test(pathname) ||
            /^\/translations\/page-\d{3}\.json$/.test(pathname),
        ),
        countCacheEntries(CACHE_TEMA, (pathname) => isTemaApiPath(pathname)),
        countCacheEntries(
          CACHE_BUNDLE,
          (pathname) =>
            pathname === "/" ||
            isReadRoutePath(pathname) ||
            isTemaRoutePathInRange(pathname),
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
  appBuildId = "unknown",
): string {
  return `${cdnAssetVersion}:${temaDataVersion}:${DOWNLOAD_SCHEMA_VERSION}:${appBuildId}`;
}

export function parseDownloadedMarker(value: string): DownloadMarker | null {
  const [cdnAssetVersion, temaDataVersion, schemaVersion = "1", appBuildId = "unknown"] =
    value.split(":");

  if (!cdnAssetVersion || !temaDataVersion) {
    return null;
  }

  return { cdnAssetVersion, temaDataVersion, schemaVersion, appBuildId };
}

/**
 * Checks whether the full mushaf has been downloaded.
 *
 * Counts every required offline bucket directly from Cache Storage.
 * localStorage marker is used only for stale-version cleanup hints.
 */
export async function isMushafDownloaded(
  cdnAssetVersion: string,
  temaDataVersion: string,
  appBuildId = "unknown",
): Promise<MushafStatus> {
  const stored = localStorage.getItem(LS_KEY_DOWNLOADED);
  const parsedStored = stored ? parseDownloadedMarker(stored) : null;
  const hasCurrentVersionMarker =
    parsedStored !== null &&
    parsedStored.cdnAssetVersion === cdnAssetVersion &&
    parsedStored.temaDataVersion === temaDataVersion &&
    parsedStored.schemaVersion === DOWNLOAD_SCHEMA_VERSION;
  const hasCurrentBuildMarker =
    hasCurrentVersionMarker && parsedStored.appBuildId === appBuildId;

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
    if (!hasCurrentBuildMarker) {
      markMushafDownloaded(cdnAssetVersion, temaDataVersion, appBuildId);
    }
    return { state: "complete", progress };
  }

  if (hasCurrentVersionMarker) {
    // Marker says complete but cache check failed; clear stale marker so UI
    // correctly reflects partial/none state.
    clearMushafDownloaded();
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
  appBuildId = "unknown",
): void {
  localStorage.setItem(
    LS_KEY_DOWNLOADED,
    buildDownloadedMarker(cdnAssetVersion, temaDataVersion, appBuildId),
  );
}

/** Clear the downloaded flag (for version migration or debug). */
export function clearMushafDownloaded(): void {
  localStorage.removeItem(LS_KEY_DOWNLOADED);
  localStorage.removeItem(LS_KEY_PACKAGE_CHECKPOINT);
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
