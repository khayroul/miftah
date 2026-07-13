import type { MushafPageManifest } from "@/mushaf/types/mushaf";
import type { MushafLayoutPage } from "@/mushaf/types/mushafLayout";
import type { MushafWordTranslationMap } from "@/mushaf/types/mushaf";
import { validatePageTranslations } from "./offlineTranslations";

export type OfflinePageResult =
  | {
      readonly available: true;
      readonly imageUrl: string;
      readonly manifest: MushafPageManifest;
      readonly layout: MushafLayoutPage;
      readonly translations: MushafWordTranslationMap;
    }
  | {
      readonly available: false;
      readonly reason: "not-downloaded" | "cache-miss" | "error" | "invalid-page";
    };

const MIN_PAGE = 1;
const MAX_PAGE = 604;

const IMAGE_CACHE_NAME = "mushaf-images-v1";
const DATA_CACHE_NAME = "mushaf-data-v2";

/**
 * Returns true if pageNumber is a valid integer between 1 and 604 inclusive.
 * This is a fast synchronous check — actual cache availability is verified
 * by the async getOfflinePageData.
 */
export function isOfflinePageAvailable(pageNumber: number): boolean {
  return (
    Number.isFinite(pageNumber) &&
    Number.isInteger(pageNumber) &&
    pageNumber >= MIN_PAGE &&
    pageNumber <= MAX_PAGE
  );
}

/**
 * Zero-pads a page number to 3 digits.
 * e.g. 1 → "001", 42 → "042", 604 → "604"
 */
function padPage(pageNumber: number): string {
  return String(pageNumber).padStart(3, "0");
}

/**
 * Searches a Cache for an entry whose URL contains the given filename pattern.
 * Returns the matched Request, or null if not found.
 */
async function findCacheEntry(
  cache: Cache,
  filenamePattern: string
): Promise<Request | null> {
  const keys = await cache.keys();
  const match = keys.find((req) => req.url.includes(filenamePattern));
  return match ?? null;
}

/**
 * Assembles read-page data from the Cache API for offline rendering.
 * Checks the mushaf-images-v1 and mushaf-data-v2 caches by page number.
 *
 * Browser-only: depends on the global `caches` API.
 */
export async function getOfflinePageData(
  pageNumber: number
): Promise<OfflinePageResult> {
  if (!isOfflinePageAvailable(pageNumber)) {
    return { available: false, reason: "invalid-page" };
  }

  try {
    const padded = padPage(pageNumber);

    // Step 1: Find the page image in the image cache
    const imageCache = await caches.open(IMAGE_CACHE_NAME);
    const imagePattern = `page_${padded}_mobile.webp`;
    const imageRequest = await findCacheEntry(imageCache, imagePattern);

    if (imageRequest === null) {
      return { available: false, reason: "not-downloaded" };
    }

    const imageUrl = imageRequest.url;

    // Step 2: Find manifest and layout in the data cache
    const dataCache = await caches.open(DATA_CACHE_NAME);

    const manifestPattern = `page_${padded}.manifest.json`;
    const manifestRequest = await findCacheEntry(dataCache, manifestPattern);

    const layoutPattern = `/layouts/page-${padded}.json`;
    const layoutRequest = await findCacheEntry(dataCache, layoutPattern);

    if (manifestRequest === null || layoutRequest === null) {
      return { available: false, reason: "cache-miss" };
    }

    // Step 3: Parse manifest
    const manifestResponse = await dataCache.match(manifestRequest);
    if (manifestResponse === undefined) {
      return { available: false, reason: "cache-miss" };
    }
    const manifest: MushafPageManifest = await manifestResponse.json();

    // Step 4: Parse layout
    const layoutResponse = await dataCache.match(layoutRequest);
    if (layoutResponse === undefined) {
      return { available: false, reason: "cache-miss" };
    }
    const layout: MushafLayoutPage = await layoutResponse.json();

    // Step 5: Read and validate translations (optional — fallback to empty map)
    const translationPattern = `/translations/page-${padded}.json`;
    const translationRequest = await findCacheEntry(dataCache, translationPattern);

    let translations: MushafWordTranslationMap = {};
    if (translationRequest !== null) {
      const translationResponse = await dataCache.match(translationRequest);
      if (translationResponse !== undefined) {
        const rawTranslations: unknown = await translationResponse.json();
        translations = validatePageTranslations(rawTranslations);
      }
    }

    return {
      available: true,
      imageUrl,
      manifest,
      layout,
      translations,
    };
  } catch (error) {
    console.error(`getOfflinePageData: failed for page ${pageNumber}`, error);
    return { available: false, reason: "error" };
  }
}
