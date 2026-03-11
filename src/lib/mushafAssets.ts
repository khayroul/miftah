import { access, readFile } from "node:fs/promises";
import path from "node:path";
import type {
  MushafAyahManifest,
  MushafPageManifest,
  MushafWordHitbox,
} from "@/types/mushaf";

export type PageVariant = "page" | "thumb";
type RawManifest = Record<string, unknown>;
type RawWord = Record<string, unknown>;

const PAGE_IMAGE_DIRS = [
  path.resolve("assets/pages"),
  path.resolve("test/pages"),
  path.resolve("test/golden/pages"),
];

const DEFAULT_WORDS_DIR = `assets${path.sep}words`;
const LEGACY_WORDS_DIR = "words";
const GOLDEN_WORDS_DIR = `test${path.sep}golden${path.sep}words`;

const WORD_IMAGE_DIRS = [
  path.join(process.cwd(), DEFAULT_WORDS_DIR),
  path.join(process.cwd(), LEGACY_WORDS_DIR),
  path.join(process.cwd(), GOLDEN_WORDS_DIR),
];

const MANIFEST_DIRS = [
  path.resolve("assets/manifests"),
  path.resolve("manifests"),
  path.resolve("test/golden/manifests"),
];

const DEFAULT_WIDTH = 1200;
const DEFAULT_HEIGHT = 1920;
const DEFAULT_PAGES_BUCKET = "mushaf-pages";
const DEFAULT_MANIFESTS_BUCKET = "mushaf-manifests";

type BucketEnvName =
  | "MUSHAF_PAGES_BUCKET"
  | "MUSHAF_MANIFESTS_BUCKET"
  | "MUSHAF_WORDS_BUCKET";

type BaseUrlEnvName =
  | "MUSHAF_PAGES_BASE_URL"
  | "MUSHAF_MANIFESTS_BASE_URL"
  | "MUSHAF_WORDS_BASE_URL";

export type MushafPageImageSource =
  | { kind: "remote"; url: string }
  | { kind: "local"; path: string };

function parseBoolean(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
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
  if (!supabaseUrl) {
    return null;
  }
  const bucket = process.env[bucketEnvName]?.trim() || fallbackBucket;
  return `${trimTrailingSlashes(supabaseUrl)}/storage/v1/object/public/${bucket}`;
}

function getRemoteBaseUrl(
  explicitEnvName: BaseUrlEnvName,
  bucketEnvName: BucketEnvName,
  fallbackBucket: string,
): string | null {
  if (!parseBoolean(process.env.MUSHAF_CDN_ENABLED)) {
    return null;
  }

  const explicit = process.env[explicitEnvName]?.trim();
  if (explicit) {
    return trimTrailingSlashes(explicit);
  }

  return buildSupabasePublicBaseUrl(bucketEnvName, fallbackBucket);
}

// CDN asset version — bump this whenever pages are re-rendered and re-uploaded
// to force browser and Cloudflare edge caches to fetch the new files.
const CDN_ASSET_VERSION = "3";

function joinUrl(baseUrl: string, filename: string): string {
  return `${trimTrailingSlashes(baseUrl)}/${filename}?v=${CDN_ASSET_VERSION}`;
}

function formatPageNumber(pageNumber: number): string {
  return String(pageNumber).padStart(3, "0");
}

function formatWordNumber(wordId: number): string {
  return String(wordId).padStart(5, "0");
}

function getPageFilename(pageNumber: number, variant: PageVariant): string {
  const padded = formatPageNumber(pageNumber);
  if (variant === "thumb") {
    return `page_${padded}_thumb.png`;
  }
  return `page_${padded}.png`;
}

function getManifestFilename(pageNumber: number): string {
  return `page_${formatPageNumber(pageNumber)}.manifest.json`;
}

function getAyahManifestFilename(surah: number, ayah: number): string {
  return `ayah_${formatPageNumber(surah)}_${formatPageNumber(ayah)}.manifest.json`;
}

function getWordFilename(wordId: number): string {
  return `word_${formatWordNumber(wordId)}.png`;
}

function getRemotePageBaseUrl(): string | null {
  return getRemoteBaseUrl(
    "MUSHAF_PAGES_BASE_URL",
    "MUSHAF_PAGES_BUCKET",
    DEFAULT_PAGES_BUCKET,
  );
}

function getRemoteManifestBaseUrl(): string | null {
  return getRemoteBaseUrl(
    "MUSHAF_MANIFESTS_BASE_URL",
    "MUSHAF_MANIFESTS_BUCKET",
    DEFAULT_MANIFESTS_BUCKET,
  );
}

function getRemoteWordBaseUrl(): string | null {
  if (!parseBoolean(process.env.MUSHAF_CDN_ENABLED)) {
    return null;
  }

  const explicit = process.env.MUSHAF_WORDS_BASE_URL?.trim();
  if (explicit) {
    return trimTrailingSlashes(explicit);
  }

  const bucket = process.env.MUSHAF_WORDS_BUCKET?.trim();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!bucket || !supabaseUrl) {
    return null;
  }

  return `${trimTrailingSlashes(supabaseUrl)}/storage/v1/object/public/${bucket}`;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function findExistingFile(
  dirs: string[],
  filename: string,
): Promise<string | null> {
  const candidates = dirs.map((dir) => path.join(dir, filename));
  const results = await Promise.all(candidates.map(fileExists));
  const foundIndex = results.indexOf(true);
  return foundIndex >= 0 ? candidates[foundIndex] : null;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function toPositiveInt(value: unknown): number | undefined {
  const parsed = toFiniteNumber(value);
  if (parsed === null || parsed <= 0) {
    return undefined;
  }
  return Math.trunc(parsed);
}

interface LocationDefaults {
  surah?: number;
  ayah?: number;
}

function parseLocation(
  rawWord: RawWord,
  index: number,
  defaults: LocationDefaults = {},
): Pick<MushafWordHitbox, "location" | "surah" | "ayah" | "wordPosition"> {
  const surah = toPositiveInt(rawWord.surah) ?? defaults.surah;
  const ayah = toPositiveInt(rawWord.ayah) ?? defaults.ayah;
  const wordPosition =
    toPositiveInt(rawWord.word_position) ??
    toPositiveInt(rawWord.wordPosition) ??
    toPositiveInt(rawWord.position);

  const rawLocation =
    typeof rawWord.location === "string" ? rawWord.location.trim() : "";

  if (rawLocation.length > 0) {
    const match = rawLocation.match(/^(\d+):(\d+):(\d+)$/);
    if (match) {
      return {
        location: rawLocation,
        surah: Number(match[1]),
        ayah: Number(match[2]),
        wordPosition: Number(match[3]),
      };
    }
    return { location: rawLocation, surah, ayah, wordPosition };
  }

  if (surah && ayah && wordPosition) {
    return {
      location: `${surah}:${ayah}:${wordPosition}`,
      surah,
      ayah,
      wordPosition,
    };
  }

  return {
    location: `unknown:${index + 1}`,
    surah,
    ayah,
    wordPosition,
  };
}

function parseHitbox(
  rawWord: RawWord,
  index: number,
  defaults: LocationDefaults = {},
): MushafWordHitbox | null {
  const x = toFiniteNumber(rawWord.x);
  const y = toFiniteNumber(rawWord.y);
  const width = toFiniteNumber(rawWord.width ?? rawWord.w);
  const height = toFiniteNumber(rawWord.height ?? rawWord.h);

  if (
    x === null ||
    y === null ||
    width === null ||
    height === null ||
    width <= 0 ||
    height <= 0 ||
    x < 0 ||
    y < 0
  ) {
    return null;
  }

  const locationData = parseLocation(rawWord, index, defaults);
  const text = typeof rawWord.text === "string" ? rawWord.text : undefined;
  const wordId = toPositiveInt(rawWord.word_id ?? rawWord.wordId);

  return {
    ...locationData,
    x,
    y,
    width,
    height,
    text,
    wordId,
  };
}

function normalizeManifest(
  rawManifest: RawManifest,
  fallbackPageNumber: number,
): MushafPageManifest | null {
  const imageWidth =
    toFiniteNumber(rawManifest.image_width ?? rawManifest.imageWidth) ??
    DEFAULT_WIDTH;
  const imageHeight =
    toFiniteNumber(rawManifest.image_height ?? rawManifest.imageHeight) ??
    DEFAULT_HEIGHT;
  const page =
    toPositiveInt(rawManifest.page) ??
    toPositiveInt(rawManifest.page_number) ??
    fallbackPageNumber;
  const schemaVersion =
    typeof rawManifest.schema_version === "string"
      ? rawManifest.schema_version
      : "1.0.0";

  if (imageWidth <= 0 || imageHeight <= 0 || page <= 0) {
    return null;
  }

  const words = Array.isArray(rawManifest.words)
    ? rawManifest.words
        .map((word, index) => {
          if (!word || typeof word !== "object") {
            return null;
          }
          return parseHitbox(word as RawWord, index);
        })
        .filter((word): word is MushafWordHitbox => word !== null)
    : [];

  return {
    page,
    schema_version: schemaVersion,
    image_width: imageWidth,
    image_height: imageHeight,
    words,
  };
}

function normalizeAyahManifest(
  rawManifest: RawManifest,
  fallbackSurah: number,
  fallbackAyah: number,
): MushafAyahManifest | null {
  const imageWidth =
    toFiniteNumber(rawManifest.image_width ?? rawManifest.imageWidth) ??
    DEFAULT_WIDTH;
  const imageHeight =
    toFiniteNumber(rawManifest.image_height ?? rawManifest.imageHeight) ??
    DEFAULT_HEIGHT;
  const surah = toPositiveInt(rawManifest.surah) ?? fallbackSurah;
  const ayah = toPositiveInt(rawManifest.ayah) ?? fallbackAyah;
  const schemaVersion =
    typeof rawManifest.schema_version === "string"
      ? rawManifest.schema_version
      : "1.0.0";

  if (imageWidth <= 0 || imageHeight <= 0 || surah <= 0 || ayah <= 0) {
    return null;
  }

  const words = Array.isArray(rawManifest.words)
    ? rawManifest.words
        .map((word, index) => {
          if (!word || typeof word !== "object") {
            return null;
          }
          return parseHitbox(word as RawWord, index, { surah, ayah });
        })
        .filter((word): word is MushafWordHitbox => word !== null)
    : [];

  return {
    surah,
    ayah,
    schema_version: schemaVersion,
    image_width: imageWidth,
    image_height: imageHeight,
    words,
  };
}

export async function resolvePageImagePath(
  pageNumber: number,
  variant: PageVariant = "page",
): Promise<string | null> {
  return findExistingFile(PAGE_IMAGE_DIRS, getPageFilename(pageNumber, variant));
}

export function getRemotePageImageUrl(
  pageNumber: number,
  variant: PageVariant = "page",
): string | null {
  const baseUrl = getRemotePageBaseUrl();
  if (!baseUrl) {
    return null;
  }
  return joinUrl(baseUrl, getPageFilename(pageNumber, variant));
}

export async function resolvePageImageSource(
  pageNumber: number,
  variant: PageVariant = "page",
): Promise<MushafPageImageSource | null> {
  const remoteUrl = getRemotePageImageUrl(pageNumber, variant);
  if (remoteUrl) {
    return { kind: "remote", url: remoteUrl };
  }

  const localPath = await resolvePageImagePath(pageNumber, variant);
  if (!localPath) {
    return null;
  }

  return { kind: "local", path: localPath };
}

export async function pageImageExists(
  pageNumber: number,
  variant: PageVariant = "page",
): Promise<boolean> {
  if (getRemotePageImageUrl(pageNumber, variant)) {
    return true;
  }
  const localPath = await resolvePageImagePath(pageNumber, variant);
  return localPath !== null;
}

export async function resolveWordImagePath(
  wordId: number,
): Promise<string | null> {
  if (!Number.isInteger(wordId) || wordId <= 0) {
    return null;
  }
  return findExistingFile(WORD_IMAGE_DIRS, getWordFilename(wordId));
}

export function getRemoteWordImageUrl(wordId: number): string | null {
  if (!Number.isInteger(wordId) || wordId <= 0) {
    return null;
  }

  const baseUrl = getRemoteWordBaseUrl();
  if (!baseUrl) {
    return null;
  }
  return joinUrl(baseUrl, getWordFilename(wordId));
}

export async function resolveWordImageSource(
  wordId: number,
): Promise<MushafPageImageSource | null> {
  const localPath = await resolveWordImagePath(wordId);
  if (localPath) {
    return { kind: "local", path: localPath };
  }

  const remoteUrl = getRemoteWordImageUrl(wordId);
  if (remoteUrl) {
    return { kind: "remote", url: remoteUrl };
  }

  return null;
}

export async function wordImageExists(wordId: number): Promise<boolean> {
  if (getRemoteWordImageUrl(wordId)) {
    return true;
  }
  const localPath = await resolveWordImagePath(wordId);
  return localPath !== null;
}

async function loadRemoteManifest(
  manifestUrl: string,
  pageNumber: number,
): Promise<MushafPageManifest | null> {
  try {
    const response = await fetch(manifestUrl);
    if (!response.ok) {
      return null;
    }
    const parsed = (await response.json()) as RawManifest;
    return normalizeManifest(parsed, pageNumber);
  } catch {
    return null;
  }
}

async function loadRemoteAyahManifest(
  manifestUrl: string,
  surah: number,
  ayah: number,
): Promise<MushafAyahManifest | null> {
  try {
    const response = await fetch(manifestUrl);
    if (!response.ok) {
      return null;
    }
    const parsed = (await response.json()) as RawManifest;
    return normalizeAyahManifest(parsed, surah, ayah);
  } catch {
    return null;
  }
}

export async function loadPageManifest(
  pageNumber: number,
): Promise<MushafPageManifest | null> {
  const manifestBaseUrl = getRemoteManifestBaseUrl();
  if (manifestBaseUrl) {
    const remoteManifest = await loadRemoteManifest(
      joinUrl(manifestBaseUrl, getManifestFilename(pageNumber)),
      pageNumber,
    );
    if (remoteManifest) {
      return remoteManifest;
    }
  }

  const filename = getManifestFilename(pageNumber);
  const manifestPath = await findExistingFile(MANIFEST_DIRS, filename);
  if (!manifestPath) {
    return null;
  }

  try {
    const raw = await readFile(manifestPath, "utf-8");
    const parsed = JSON.parse(raw) as RawManifest;
    return normalizeManifest(parsed, pageNumber);
  } catch {
    return null;
  }
}

export async function loadAyahManifest(
  surah: number,
  ayah: number,
): Promise<MushafAyahManifest | null> {
  if (
    !Number.isInteger(surah) ||
    !Number.isInteger(ayah) ||
    surah <= 0 ||
    ayah <= 0
  ) {
    return null;
  }

  const manifestBaseUrl = getRemoteManifestBaseUrl();
  if (manifestBaseUrl) {
    const remoteManifest = await loadRemoteAyahManifest(
      joinUrl(manifestBaseUrl, getAyahManifestFilename(surah, ayah)),
      surah,
      ayah,
    );
    if (remoteManifest) {
      return remoteManifest;
    }
  }

  const filename = getAyahManifestFilename(surah, ayah);
  const manifestPath = await findExistingFile(MANIFEST_DIRS, filename);
  if (!manifestPath) {
    return null;
  }

  try {
    const raw = await readFile(manifestPath, "utf-8");
    const parsed = JSON.parse(raw) as RawManifest;
    return normalizeAyahManifest(parsed, surah, ayah);
  } catch {
    return null;
  }
}
