export const CACHE_IMAGES = "mushaf-images-v1";
export const CACHE_DATA = "mushaf-data-v2";
export const CACHE_TEMA = "tema-data-v1";
export const CACHE_BUNDLE = "miftah-offline-bundle-v1";

export const TOTAL_PAGES = 604;
export const TOTAL_TEMA_ENTRIES = 114;
export const TOTAL_DATA_ENTRIES = TOTAL_PAGES * 3;
export const TOTAL_ROUTE_ENTRIES = TOTAL_PAGES + TOTAL_TEMA_ENTRIES;
export const TOTAL_FONT_ENTRIES = TOTAL_PAGES + 2;

export const OFFLINE_SHELL_PATHS = [
  "/offline.html",
  "/pwa-config.json",
  "/manifest.webmanifest",
  "/icons/apple-touch-icon.png",
  "/icons/icon-192.png",
  "/icons/icon-192-maskable.png",
  "/icons/icon-512.png",
  "/icons/icon-512-maskable.png",
  "/images/surah-frame-ios.png",
  "/mushaf/ayah-end-marker-quran-ios.png",
] as const;

export const TOTAL_SHELL_ENTRIES = OFFLINE_SHELL_PATHS.length;

export const TOTAL_ITEMS =
  TOTAL_PAGES +
  TOTAL_DATA_ENTRIES +
  TOTAL_TEMA_ENTRIES +
  TOTAL_ROUTE_ENTRIES +
  TOTAL_FONT_ENTRIES +
  TOTAL_SHELL_ENTRIES;

export interface OfflineBundleCounts {
  readonly images: number;
  readonly data: number;
  readonly tema: number;
  readonly routes: number;
  readonly fonts: number;
  readonly shell: number;
  readonly staticAssets: number;
}

export function zeroPad(value: number, digits = 3): string {
  return String(value).padStart(digits, "0");
}

export function buildPageImagePattern(pageNumber: number): string {
  return `page_${zeroPad(pageNumber)}_mobile.webp`;
}

export function buildPageManifestPattern(pageNumber: number): string {
  return `page_${zeroPad(pageNumber)}.manifest.json`;
}

export function buildLayoutPath(pageNumber: number): string {
  return `/layouts/page-${zeroPad(pageNumber)}.json`;
}

export function buildTranslationPath(pageNumber: number): string {
  return `/translations/page-${zeroPad(pageNumber)}.json`;
}

export function buildReadRoutePath(pageNumber: number): string {
  return `/read/${pageNumber}`;
}

export function buildTemaRoutePath(surahNumber: number): string {
  return `/read/surah/${surahNumber}/themes`;
}

export function buildPageFontPath(pageNumber: number): string {
  return `/fonts/qcf-v2-woff2/p${pageNumber}.woff2`;
}

export const GLOBAL_FONT_PATHS = [
  "/fonts/sura_names.woff2",
  "/fonts/QCF_BSML.ttf",
] as const;

export function getCompletedItems(counts: OfflineBundleCounts): number {
  return (
    counts.images +
    counts.data +
    counts.tema +
    counts.routes +
    counts.fonts +
    counts.shell
  );
}

export function isReadRoutePath(pathname: string): boolean {
  return /^\/read\/\d+\/?$/.test(pathname);
}

export function isTemaRoutePath(pathname: string): boolean {
  return /^\/read\/surah\/\d+\/themes\/?$/.test(pathname);
}

export function isBundleFontPath(pathname: string): boolean {
  if (GLOBAL_FONT_PATHS.includes(pathname as (typeof GLOBAL_FONT_PATHS)[number])) {
    return true;
  }

  return /^\/fonts\/qcf-v2-woff2\/p\d+\.woff2$/.test(pathname);
}

export function isOfflineShellPath(pathname: string): boolean {
  return OFFLINE_SHELL_PATHS.includes(
    pathname as (typeof OFFLINE_SHELL_PATHS)[number],
  );
}
