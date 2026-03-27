export const LS_KEY_DOWNLOADED = "miftah:mushaf-downloaded";
const LS_KEY_DISMISSED = "miftah:mushaf-dismissed";
const LS_KEY_STARTED = "miftah:mushaf-download-started";

const CACHE_IMAGES = "mushaf-images-v1";
const CACHE_DATA = "mushaf-data-v1";

export const TOTAL_PAGES = 604;
const TOTAL_DATA_ENTRIES = TOTAL_PAGES * 3; // manifest + layout + translation per page

const TOTAL_TEMA_ENTRIES = 114;
export const TOTAL_ITEMS = TOTAL_PAGES + TOTAL_TEMA_ENTRIES; // 718
export const CACHE_TEMA = "tema-data-v1";

export type MushafStatus =
  | { readonly state: "complete" }
  | { readonly state: "partial"; readonly completedItems: number }
  | { readonly state: "none" };

/**
 * Checks whether the full mushaf has been downloaded.
 *
 * Fast path: localStorage flag matches current version → complete.
 * Slow path: count WebP entries in image cache + data entries in data cache.
 */
export async function isMushafDownloaded(
  cdnAssetVersion: string,
  temaDataVersion: string,
): Promise<MushafStatus> {
  const compositeVersion = `${cdnAssetVersion}:${temaDataVersion}`;

  // Fast path
  const stored = localStorage.getItem(LS_KEY_DOWNLOADED);
  if (stored === compositeVersion) {
    return { state: "complete" };
  }

  // Slow path — count cache entries
  try {
    const imageCache = await caches.open(CACHE_IMAGES);
    const imageKeys = await imageCache.keys();
    const webpCount = imageKeys.filter((r) =>
      r.url.includes("_mobile.webp"),
    ).length;

    // Count tema cache entries
    const temaCache = await caches.open(CACHE_TEMA);
    const temaKeys = await temaCache.keys();
    const temaCount = temaKeys.length;

    if (webpCount === 0 && temaCount === 0) {
      return { state: "none" };
    }

    if (webpCount >= TOTAL_PAGES && temaCount >= TOTAL_TEMA_ENTRIES) {
      const dataCache = await caches.open(CACHE_DATA);
      const dataKeys = await dataCache.keys();
      if (dataKeys.length >= TOTAL_DATA_ENTRIES) {
        markMushafDownloaded(cdnAssetVersion, temaDataVersion);
        return { state: "complete" };
      }
    }

    return { state: "partial", completedItems: webpCount + temaCount };
  } catch {
    return { state: "none" };
  }
}

/** Mark the mushaf as fully downloaded for the given asset version. */
export function markMushafDownloaded(
  cdnAssetVersion: string,
  temaDataVersion: string,
): void {
  localStorage.setItem(
    LS_KEY_DOWNLOADED,
    `${cdnAssetVersion}:${temaDataVersion}`,
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
