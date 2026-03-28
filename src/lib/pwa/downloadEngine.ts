import {
  CACHE_BUNDLE,
  CACHE_TEMA,
  LS_KEY_DOWNLOADED,
  LS_KEY_PACKAGE_CHECKPOINT,
  clearMushafDownloaded,
  isMushafDownloaded,
  markMushafDownloaded,
  parseDownloadedMarker,
} from "./mushafStatus";
import {
  CACHE_DATA,
  CACHE_IMAGES,
  OFFLINE_SHELL_PATHS,
  TOTAL_DATA_ENTRIES,
  TOTAL_FONT_ENTRIES,
  TOTAL_ITEMS,
  TOTAL_PAGES,
  TOTAL_ROUTE_ENTRIES,
  TOTAL_SHELL_ENTRIES,
  TOTAL_TEMA_ENTRIES,
  buildPageFontPath,
  buildReadRoutePath,
  buildTemaRoutePath,
  isTemaRoutePath,
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
  readonly appBuildId?: string;
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
    typeof v.manifestsBucket === "string" &&
    (typeof v.appBuildId === "string" || typeof v.appBuildId === "undefined")
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
  const base = config.supabaseStorageBase.trim();
  const v = config.cdnAssetVersion;

  if (!base) {
    return {
      webp: `/api/mushaf/page/${pageNumber}?variant=mobile`,
      manifest: `/api/mushaf/manifest/${pageNumber}`,
      layout: `/layouts/page-${padded}.json`,
      translation: `/translations/page-${padded}.json`,
    };
  }

  return {
    webp: `${base}/${config.pagesBucket}/page_${padded}_mobile.webp?v=${v}`,
    manifest: `${base}/${config.manifestsBucket}/page_${padded}.manifest.json?v=${v}`,
    layout: `/layouts/page-${padded}.json`,
    translation: `/translations/page-${padded}.json`,
  };
}

// ---------------------------------------------------------------------------
// Packages + Progress
// ---------------------------------------------------------------------------

export type DownloadPackageId = "tema" | "mushaf";

export interface DownloadPackageDefinition {
  readonly id: DownloadPackageId;
  readonly label: string;
  readonly index: number;
  readonly count: number;
  readonly totalItems: number;
}

const TEMA_PACKAGE_TOTAL_ITEMS = TOTAL_TEMA_ENTRIES * 2;
const MUSHAF_ROUTE_TOTAL_ITEMS = TOTAL_ROUTE_ENTRIES - TOTAL_TEMA_ENTRIES;
const MUSHAF_PACKAGE_TOTAL_ITEMS =
  TOTAL_PAGES +
  TOTAL_DATA_ENTRIES +
  TOTAL_FONT_ENTRIES +
  TOTAL_SHELL_ENTRIES +
  MUSHAF_ROUTE_TOTAL_ITEMS;

export const DOWNLOAD_PACKAGES: readonly DownloadPackageDefinition[] = [
  {
    id: "tema",
    label: "Tema",
    index: 1,
    count: 2,
    totalItems: TEMA_PACKAGE_TOTAL_ITEMS,
  },
  {
    id: "mushaf",
    label: "Mushaf",
    index: 2,
    count: 2,
    totalItems: MUSHAF_PACKAGE_TOTAL_ITEMS,
  },
] as const;

const DOWNLOAD_PACKAGE_MAP: Readonly<Record<DownloadPackageId, DownloadPackageDefinition>> = {
  tema: DOWNLOAD_PACKAGES[0],
  mushaf: DOWNLOAD_PACKAGES[1],
};

interface PackageProgressState {
  readonly temaCompletedItems: number;
  readonly mushafCompletedItems: number;
}

export type MushafDownloadProgress = {
  readonly completedItems: number;
  readonly totalItems: number;
  readonly packageId: DownloadPackageId;
  readonly packageLabel: string;
  readonly packageIndex: number;
  readonly packageCount: number;
  readonly packageCompletedItems: number;
  readonly packageTotalItems: number;
};

type ProgressCallback = (progress: MushafDownloadProgress) => void;

function clampCount(value: number, max: number): number {
  return Math.max(0, Math.min(value, max));
}

function getPackageDefinition(packageId: DownloadPackageId): DownloadPackageDefinition {
  return DOWNLOAD_PACKAGE_MAP[packageId];
}

function buildProgressPayload(
  completedItems: number,
  packageId: DownloadPackageId,
  packageProgress: PackageProgressState,
): MushafDownloadProgress {
  const pkg = getPackageDefinition(packageId);
  const rawPackageCompleted =
    packageId === "tema"
      ? packageProgress.temaCompletedItems
      : packageProgress.mushafCompletedItems;

  return {
    completedItems: clampCount(completedItems, TOTAL_ITEMS),
    totalItems: TOTAL_ITEMS,
    packageId,
    packageLabel: pkg.label,
    packageIndex: pkg.index,
    packageCount: pkg.count,
    packageCompletedItems: clampCount(rawPackageCompleted, pkg.totalItems),
    packageTotalItems: pkg.totalItems,
  };
}

// ---------------------------------------------------------------------------
// Download checkpoint
// ---------------------------------------------------------------------------

interface DownloadCheckpoint {
  readonly packageId: DownloadPackageId;
  readonly cdnAssetVersion: string;
  readonly temaDataVersion: string;
  readonly appBuildId: string;
}

function clearDownloadCheckpoint(): void {
  localStorage.removeItem(LS_KEY_PACKAGE_CHECKPOINT);
}

function parseDownloadCheckpoint(raw: string): DownloadCheckpoint | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const record = parsed as Record<string, unknown>;

    const packageId = record.packageId;
    const cdnAssetVersion = record.cdnAssetVersion;
    const temaDataVersion = record.temaDataVersion;
    const appBuildId = record.appBuildId;

    if (packageId !== "tema" && packageId !== "mushaf") return null;
    if (typeof cdnAssetVersion !== "string") return null;
    if (typeof temaDataVersion !== "string") return null;
    if (typeof appBuildId !== "string") return null;

    return {
      packageId,
      cdnAssetVersion,
      temaDataVersion,
      appBuildId,
    };
  } catch {
    return null;
  }
}

function readDownloadCheckpoint(
  cdnAssetVersion: string,
  temaDataVersion: string,
  appBuildId: string,
): DownloadCheckpoint | null {
  const raw = localStorage.getItem(LS_KEY_PACKAGE_CHECKPOINT);
  if (raw === null) return null;

  const parsed = parseDownloadCheckpoint(raw);
  if (parsed === null) {
    clearDownloadCheckpoint();
    return null;
  }

  if (
    parsed.cdnAssetVersion !== cdnAssetVersion ||
    parsed.temaDataVersion !== temaDataVersion ||
    parsed.appBuildId !== appBuildId
  ) {
    clearDownloadCheckpoint();
    return null;
  }

  return parsed;
}

export function getDownloadCheckpointPackage(
  config: Pick<PwaConfig, "cdnAssetVersion" | "temaDataVersion" | "appBuildId">,
): DownloadPackageId | null {
  const parsed = readDownloadCheckpoint(
    config.cdnAssetVersion,
    config.temaDataVersion ?? "1",
    config.appBuildId ?? "unknown",
  );
  return parsed?.packageId ?? null;
}

function writeDownloadCheckpoint(
  packageId: DownloadPackageId,
  cdnAssetVersion: string,
  temaDataVersion: string,
  appBuildId: string,
): void {
  const checkpoint: DownloadCheckpoint = {
    packageId,
    cdnAssetVersion,
    temaDataVersion,
    appBuildId,
  };

  localStorage.setItem(LS_KEY_PACKAGE_CHECKPOINT, JSON.stringify(checkpoint));
}

async function countTemaRouteEntries(): Promise<number> {
  const cache = await caches.open(CACHE_BUNDLE);
  const keys = await cache.keys();

  return keys.reduce((count, request) => {
    const pathname = new URL(request.url).pathname;
    return isTemaRoutePath(pathname) ? count + 1 : count;
  }, 0);
}

async function resolveInitialPackageState(
  completedItems: number,
  temaCompletedItems: number,
): Promise<{ packageId: DownloadPackageId; packageProgress: PackageProgressState }> {
  const temaRouteEntries = await countTemaRouteEntries();
  const temaProgress = clampCount(
    temaCompletedItems + temaRouteEntries,
    TEMA_PACKAGE_TOTAL_ITEMS,
  );
  const mushafProgress = clampCount(
    completedItems - temaProgress,
    MUSHAF_PACKAGE_TOTAL_ITEMS,
  );

  if (temaProgress < TEMA_PACKAGE_TOTAL_ITEMS) {
    return {
      packageId: "tema",
      packageProgress: {
        temaCompletedItems: temaProgress,
        mushafCompletedItems: mushafProgress,
      },
    };
  }

  return {
    packageId: "mushaf",
    packageProgress: {
      temaCompletedItems: temaProgress,
      mushafCompletedItems: mushafProgress,
    },
  };
}

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
  temaDataVersion: string,
  appBuildId: string,
): Promise<void> {
  const stored = localStorage.getItem(LS_KEY_DOWNLOADED);
  if (stored === null) return;

  const parsed = parseDownloadedMarker(stored);
  if (!parsed) {
    clearMushafDownloaded();
    clearDownloadCheckpoint();
    return;
  }

  const storedCdn = parsed.cdnAssetVersion;
  const storedTema = parsed.temaDataVersion;

  if (storedCdn !== cdnAssetVersion) {
    await caches.delete(CACHE_IMAGES);
    await caches.delete(CACHE_DATA);
    await caches.delete(CACHE_BUNDLE);
    clearMushafDownloaded();
    clearDownloadCheckpoint();
    return;
  }

  if (storedTema !== temaDataVersion) {
    await caches.delete(CACHE_TEMA);
    clearMushafDownloaded();
    clearDownloadCheckpoint();
    await caches.delete(CACHE_BUNDLE);
    return;
  }

  if (parsed.schemaVersion !== "2") {
    clearMushafDownloaded();
    clearDownloadCheckpoint();
  }

  if (parsed.appBuildId !== appBuildId) {
    await caches.delete(CACHE_BUNDLE);
    clearMushafDownloaded();
    clearDownloadCheckpoint();
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

function emitProgress(
  completedItems: number,
  packageId: DownloadPackageId,
  packageProgress: PackageProgressState,
  onProgress?: ProgressCallback,
): void {
  if (onProgress === undefined) return;
  onProgress(buildProgressPayload(completedItems, packageId, packageProgress));
}

function withTemaProgress(
  progress: PackageProgressState,
  increment: number,
): PackageProgressState {
  return {
    ...progress,
    temaCompletedItems: clampCount(
      progress.temaCompletedItems + increment,
      TEMA_PACKAGE_TOTAL_ITEMS,
    ),
  };
}

function withMushafProgress(
  progress: PackageProgressState,
  increment: number,
): PackageProgressState {
  return {
    ...progress,
    mushafCompletedItems: clampCount(
      progress.mushafCompletedItems + increment,
      MUSHAF_PACKAGE_TOTAL_ITEMS,
    ),
  };
}

export async function downloadMushaf(
  config: PwaConfig,
  onProgress?: ProgressCallback,
): Promise<void> {
  if (isDownloading) return; // concurrency guard
  isDownloading = true;

  const controller = new AbortController();
  activeController = controller;

  const temaDataVersion = config.temaDataVersion ?? "1";
  const appBuildId = config.appBuildId ?? "unknown";

  try {
    // Version migration
    await migrateIfVersionChanged(
      config.cdnAssetVersion,
      temaDataVersion,
      appBuildId,
    );
    const baselineStatus = await isMushafDownloaded(
      config.cdnAssetVersion,
      temaDataVersion,
      appBuildId,
    );

    if (baselineStatus.state === "complete") {
      clearDownloadCheckpoint();
      return;
    }

    // Storage checks
    const hasQuota = await checkStorageQuota();
    if (!hasQuota) {
      throw new Error(
        "Ruang storan tidak mencukupi (~260 MB diperlukan)",
      );
    }
    await requestPersistentStorage();

    let completedItems = baselineStatus.progress.completedItems;
    void readDownloadCheckpoint(
      config.cdnAssetVersion,
      temaDataVersion,
      appBuildId,
    );
    const initialState = await resolveInitialPackageState(
      completedItems,
      baselineStatus.progress.tema,
    );

    let activePackageId = initialState.packageId;
    let packageProgress = initialState.packageProgress;

    emitProgress(completedItems, activePackageId, packageProgress, onProgress);

    if (packageProgress.temaCompletedItems < TEMA_PACKAGE_TOTAL_ITEMS) {
      activePackageId = "tema";
      writeDownloadCheckpoint(
        activePackageId,
        config.cdnAssetVersion,
        temaDataVersion,
        appBuildId,
      );
      emitProgress(completedItems, activePackageId, packageProgress, onProgress);

      for (let surah = 1; surah <= TOTAL_TEMA_ENTRIES; surah += 2) {
        if (controller.signal.aborted) break;

        const batch: Promise<number>[] = [
          downloadTemaBundle(surah, controller),
        ];
        if (surah + 1 <= TOTAL_TEMA_ENTRIES) {
          batch.push(downloadTemaBundle(surah + 1, controller));
        }

        const batchInserted = await Promise.all(batch);
        const insertedCount = batchInserted.reduce((sum, value) => sum + value, 0);
        completedItems += insertedCount;
        packageProgress = withTemaProgress(packageProgress, insertedCount);
        emitProgress(completedItems, activePackageId, packageProgress, onProgress);
      }
    }

    if (
      !controller.signal.aborted &&
      packageProgress.temaCompletedItems >= TEMA_PACKAGE_TOTAL_ITEMS &&
      packageProgress.mushafCompletedItems < MUSHAF_PACKAGE_TOTAL_ITEMS
    ) {
      activePackageId = "mushaf";
      writeDownloadCheckpoint(
        activePackageId,
        config.cdnAssetVersion,
        temaDataVersion,
        appBuildId,
      );
      emitProgress(completedItems, activePackageId, packageProgress, onProgress);

      const insertedShell = await cacheOfflineShellAssets(controller);
      completedItems += insertedShell;
      packageProgress = withMushafProgress(packageProgress, insertedShell);
      emitProgress(completedItems, activePackageId, packageProgress, onProgress);

      // Download mushaf pages, page data, page fonts, and cached
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
        const insertedCount = batchInserted.reduce((sum, value) => sum + value, 0);
        completedItems += insertedCount;
        packageProgress = withMushafProgress(packageProgress, insertedCount);

        emitProgress(completedItems, activePackageId, packageProgress, onProgress);
      }

      const insertedFonts = await cacheGlobalFonts(controller);
      completedItems += insertedFonts;
      packageProgress = withMushafProgress(packageProgress, insertedFonts);
      emitProgress(completedItems, activePackageId, packageProgress, onProgress);
    }

    if (!controller.signal.aborted) {
      const finalStatus = await isMushafDownloaded(
        config.cdnAssetVersion,
        temaDataVersion,
        appBuildId,
      );

      if (finalStatus.state !== "complete") {
        throw new Error(
          "Muat turun belum lengkap. Cuba semula semasa sambungan stabil.",
        );
      }

      markMushafDownloaded(config.cdnAssetVersion, temaDataVersion, appBuildId);
      clearDownloadCheckpoint();
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
