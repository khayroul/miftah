import { SURAH_PAGE_MAP } from "./surahPageMap";
import {
  createEmptyPack,
  updatePackStatus,
  savePack,
  getPack,
  recordDownloadHistory,
} from "./packDb";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface PwaConfig {
  readonly cdnAssetVersion: string;
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
      "pwa-config.json has an empty supabaseStorageBase. Set NEXT_PUBLIC_SUPABASE_URL and rebuild."
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

export function buildPageAssetUrls(pageNumber: number, config: PwaConfig): PageAssetUrls {
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
// Download progress
// ---------------------------------------------------------------------------

export type DownloadProgress = {
  readonly surahId: number;
  readonly status: "downloading" | "complete" | "error";
  readonly downloadedPages: number;
  readonly totalPages: number;
  readonly errorMessage?: string;
};

type ProgressCallback = (progress: DownloadProgress) => void;

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
// Download engine
// ---------------------------------------------------------------------------

async function fetchAndCache(
  url: string,
  cacheName: string,
  controller: AbortController
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

export async function downloadSurah(
  surahId: number,
  config: PwaConfig,
  onProgress?: ProgressCallback
): Promise<void> {
  const entry = SURAH_PAGE_MAP[surahId];
  if (entry === undefined) {
    throw new Error(`Unknown surah ID: ${surahId}`);
  }

  const { startPage, endPage } = entry;
  const totalPages = endPage - startPage + 1;

  // Concurrency guard — bail if already downloading
  const existingPack = await getPack(surahId);
  if (existingPack?.status === "downloading") return;

  // Initialise pack in IndexedDB
  let pack = createEmptyPack(surahId, [startPage, endPage]);
  pack = updatePackStatus(pack, { status: "downloading", assetVersion: config.cdnAssetVersion });
  await savePack(pack);

  const controller = new AbortController();
  activeController = controller;

  try {
    for (let page = startPage; page <= endPage; page++) {
      if (controller.signal.aborted) break;

      const urls = buildPageAssetUrls(page, config);

      await fetchAndCache(urls.webp, CACHE_IMAGES, controller);
      await fetchAndCache(urls.manifest, CACHE_DATA, controller);
      await fetchAndCache(urls.layout, CACHE_DATA, controller);
      await fetchAndCache(urls.translation, CACHE_DATA, controller);

      const downloadedPages = page - startPage + 1;
      pack = updatePackStatus(pack, { downloadedPages });
      await savePack(pack);

      onProgress?.({
        surahId,
        status: "downloading",
        downloadedPages,
        totalPages,
      });
    }

    if (!controller.signal.aborted) {
      pack = updatePackStatus(pack, { status: "complete" });
      await savePack(pack);
      await recordDownloadHistory(surahId);

      onProgress?.({
        surahId,
        status: "complete",
        downloadedPages: totalPages,
        totalPages,
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Download failed";
    pack = updatePackStatus(pack, { status: "error", errorMessage });
    await savePack(pack);

    onProgress?.({
      surahId,
      status: "error",
      downloadedPages: pack.downloadedPages,
      totalPages,
      errorMessage,
    });

    throw error;
  } finally {
    if (activeController === controller) {
      activeController = null;
    }
  }
}
