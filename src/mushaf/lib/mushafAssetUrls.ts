import { MUSHAF_CDN_ASSET_VERSION } from "./mushafAssetVersion";

export type PageVariant = "page" | "thumb" | "mobile";

export type MushafPageImageSource =
  | { kind: "remote"; url: string }
  | { kind: "local"; path: string };

const DEFAULT_AYAT_BUCKET = "mushaf-ayat";
const DEFAULT_PAGES_BUCKET = "mushaf-pages";
const DEFAULT_MANIFESTS_BUCKET = "mushaf-manifests";

type BucketEnvName =
  | "MUSHAF_AYAT_BUCKET"
  | "MUSHAF_PAGES_BUCKET"
  | "MUSHAF_MANIFESTS_BUCKET"
  | "MUSHAF_WORDS_BUCKET";

type BaseUrlEnvName =
  | "MUSHAF_AYAT_BASE_URL"
  | "MUSHAF_PAGES_BASE_URL"
  | "MUSHAF_MANIFESTS_BASE_URL"
  | "MUSHAF_WORDS_BASE_URL";

function parseBoolean(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

function buildSupabasePublicBaseUrl(
  bucketEnvName: BucketEnvName,
  fallbackBucket: string,
): string | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!supabaseUrl) return null;
  const bucket = process.env[bucketEnvName]?.trim() || fallbackBucket;
  return `${trimTrailingSlashes(supabaseUrl)}/storage/v1/object/public/${bucket}`;
}

function getRemoteBaseUrl(
  explicitEnvName: BaseUrlEnvName,
  bucketEnvName: BucketEnvName,
  fallbackBucket: string,
): string | null {
  if (!parseBoolean(process.env.MUSHAF_CDN_ENABLED)) return null;

  const explicit = process.env[explicitEnvName]?.trim();
  if (explicit) return trimTrailingSlashes(explicit);

  return buildSupabasePublicBaseUrl(bucketEnvName, fallbackBucket);
}

export function joinAssetUrl(baseUrl: string, filename: string): string {
  return `${trimTrailingSlashes(baseUrl)}/${filename}?v=${MUSHAF_CDN_ASSET_VERSION}`;
}

function formatPageNumber(pageNumber: number): string {
  return String(pageNumber).padStart(3, "0");
}

function formatWordNumber(wordId: number): string {
  return String(wordId).padStart(5, "0");
}

export function getPageFilename(pageNumber: number, variant: PageVariant): string {
  const padded = formatPageNumber(pageNumber);
  if (variant === "thumb") return `page_${padded}_thumb.png`;
  if (variant === "mobile") return `page_${padded}_mobile.webp`;
  return `page_${padded}.png`;
}

export function getManifestFilename(pageNumber: number): string {
  return `page_${formatPageNumber(pageNumber)}.manifest.json`;
}

export function getAyahManifestFilename(surah: number, ayah: number): string {
  return `ayah_${formatPageNumber(surah)}_${formatPageNumber(ayah)}.manifest.json`;
}

export function getAyahFilename(surah: number, ayah: number): string {
  return `ayah_${formatPageNumber(surah)}_${formatPageNumber(ayah)}.png`;
}

export function getWordFilename(wordId: number): string {
  return `word_${formatWordNumber(wordId)}.png`;
}

export function getQuranWordAudioUrl(
  surah: number,
  ayah: number,
  wordPosition: number,
): string {
  const s = String(surah).padStart(3, "0");
  const a = String(ayah).padStart(3, "0");
  const w = String(wordPosition).padStart(3, "0");
  return `https://audio.qurancdn.com/wbw/${s}_${a}_${w}.mp3`;
}

function getRemoteAyahBaseUrl(): string | null {
  return getRemoteBaseUrl(
    "MUSHAF_AYAT_BASE_URL",
    "MUSHAF_AYAT_BUCKET",
    DEFAULT_AYAT_BUCKET,
  );
}

function getRemotePageBaseUrl(): string | null {
  return getRemoteBaseUrl(
    "MUSHAF_PAGES_BASE_URL",
    "MUSHAF_PAGES_BUCKET",
    DEFAULT_PAGES_BUCKET,
  );
}

export function getRemoteManifestBaseUrl(): string | null {
  return getRemoteBaseUrl(
    "MUSHAF_MANIFESTS_BASE_URL",
    "MUSHAF_MANIFESTS_BUCKET",
    DEFAULT_MANIFESTS_BUCKET,
  );
}

function getRemoteWordBaseUrl(): string | null {
  if (!parseBoolean(process.env.MUSHAF_CDN_ENABLED)) return null;

  const explicit = process.env.MUSHAF_WORDS_BASE_URL?.trim();
  if (explicit) return trimTrailingSlashes(explicit);

  const bucket = process.env.MUSHAF_WORDS_BUCKET?.trim();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!bucket || !supabaseUrl) return null;

  return `${trimTrailingSlashes(supabaseUrl)}/storage/v1/object/public/${bucket}`;
}

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

export function getRemoteAyahImageUrl(surah: number, ayah: number): string | null {
  if (!isPositiveInteger(surah) || !isPositiveInteger(ayah)) return null;
  const baseUrl = getRemoteAyahBaseUrl();
  return baseUrl ? joinAssetUrl(baseUrl, getAyahFilename(surah, ayah)) : null;
}

export function getAyahImageClientSrc(surah: number, ayah: number): string {
  return getRemoteAyahImageUrl(surah, ayah) ?? `/api/mushaf/ayah/${surah}/${ayah}?v=qcfv2`;
}

export function getRemotePageImageUrl(
  pageNumber: number,
  variant: PageVariant = "page",
): string | null {
  const baseUrl = getRemotePageBaseUrl();
  return baseUrl ? joinAssetUrl(baseUrl, getPageFilename(pageNumber, variant)) : null;
}

export function getPageImageClientSrc(
  pageNumber: number,
  variant: PageVariant = "page",
): string {
  const remoteUrl = getRemotePageImageUrl(pageNumber, variant);
  if (remoteUrl) return remoteUrl;

  const params =
    variant === "thumb"
      ? "?variant=thumb&v=qcfv2"
      : variant === "mobile"
        ? "?variant=mobile&v=qcfv2"
        : "?v=qcfv2";
  return `/api/mushaf/page/${pageNumber}${params}`;
}

export function getRemoteWordImageUrl(wordId: number): string | null {
  if (!isPositiveInteger(wordId)) return null;
  const baseUrl = getRemoteWordBaseUrl();
  return baseUrl ? joinAssetUrl(baseUrl, getWordFilename(wordId)) : null;
}

export function getWordImageClientSrc(wordId: number): string {
  return getRemoteWordImageUrl(wordId) ?? `/api/mushaf/word/${wordId}?v=qcfv2`;
}
