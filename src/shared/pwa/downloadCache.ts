import {
  CACHE_BUNDLE,
  CACHE_DATA,
  CACHE_IMAGES,
  CACHE_TEMA,
  OFFLINE_SHELL_PATHS,
  buildPageFontPath,
  buildReadRoutePath,
  buildTemaRoutePath,
} from "./offlineBundle";
import { buildPageAssetUrls, type PwaConfig } from "./downloadConfig";

async function fetchAndCache(
  url: string,
  cacheName: string,
  controller: AbortController,
): Promise<boolean> {
  const cache = await caches.open(cacheName);
  if (await cache.match(url)) return false;

  const response = await fetch(url, { signal: controller.signal });
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
  await cache.put(url, response);
  return true;
}

async function fetchAndCacheWithRetry(
  url: string,
  cacheName: string,
  controller: AbortController,
  maxRetries = 2,
): Promise<boolean> {
  const delays = [1000, 3000];
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fetchAndCache(url, cacheName, controller);
    } catch (error) {
      if (controller.signal.aborted || attempt === maxRetries) throw error;
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
    if (!fetched.ok) throw new Error(`Failed to fetch ${url}: ${fetched.status}`);
    await cache.put(cacheKey, fetched.clone());
    response = fetched;
    inserted = true;
  }

  await cacheExtractedStaticAssets(await response.clone().text(), controller);
  return inserted;
}

export async function cacheOfflineShellAssets(
  controller: AbortController,
): Promise<number> {
  let insertedCount = 0;
  for (const path of OFFLINE_SHELL_PATHS) {
    if (await fetchAndCacheWithRetry(path, CACHE_BUNDLE, controller)) insertedCount += 1;
  }
  if (await cacheRouteDocument("/", controller)) insertedCount += 1;
  return insertedCount;
}

export async function cacheGlobalFonts(
  controller: AbortController,
): Promise<number> {
  let insertedCount = 0;
  for (const path of ["/fonts/sura_names.woff2", "/fonts/QCF_BSML.ttf"]) {
    if (await fetchAndCacheWithRetry(path, CACHE_BUNDLE, controller)) insertedCount += 1;
  }
  return insertedCount;
}

export async function downloadPage(
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

export async function downloadTemaBundle(
  surah: number,
  controller: AbortController,
): Promise<number> {
  const results = await Promise.all([
    fetchAndCacheWithRetry(`/api/tema/${surah}`, CACHE_TEMA, controller),
    cacheRouteDocument(buildTemaRoutePath(surah), controller),
  ]);
  return results.filter(Boolean).length;
}

const REQUIRED_BYTES = 260_000_000;

export async function prepareStorage(): Promise<void> {
  if (navigator.storage?.estimate) {
    const estimate = await navigator.storage.estimate();
    const available = (estimate.quota ?? 0) - (estimate.usage ?? 0);
    if (available < REQUIRED_BYTES) {
      throw new Error("Ruang storan tidak mencukupi (~260 MB diperlukan)");
    }
  }
  if (navigator.storage?.persist) await navigator.storage.persist();
}
