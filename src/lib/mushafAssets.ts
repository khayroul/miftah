import { access, readFile } from "node:fs/promises";
import path from "node:path";
import type { MushafPageManifest, MushafWordHitbox } from "@/types/mushaf";

export type PageVariant = "page" | "thumb";
type RawManifest = Record<string, unknown>;
type RawWord = Record<string, unknown>;

const PAGE_IMAGE_DIRS = [
  path.resolve("assets/pages"),
  path.resolve("test/pages"),
  path.resolve("test/golden/pages"),
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
  bucketEnvName: "MUSHAF_PAGES_BUCKET" | "MUSHAF_MANIFESTS_BUCKET",
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
  explicitEnvName: "MUSHAF_PAGES_BASE_URL" | "MUSHAF_MANIFESTS_BASE_URL",
  bucketEnvName: "MUSHAF_PAGES_BUCKET" | "MUSHAF_MANIFESTS_BUCKET",
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

function joinUrl(baseUrl: string, filename: string): string {
  return `${trimTrailingSlashes(baseUrl)}/${filename}`;
}

function formatPageNumber(pageNumber: number): string {
  return String(pageNumber).padStart(3, "0");
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
  for (const dir of dirs) {
    const candidate = path.join(dir, filename);
    if (await fileExists(candidate)) {
      return candidate;
    }
  }
  return null;
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

function parseLocation(
  rawWord: RawWord,
  index: number,
): Pick<MushafWordHitbox, "location" | "surah" | "ayah" | "wordPosition"> {
  const surah = toPositiveInt(rawWord.surah);
  const ayah = toPositiveInt(rawWord.ayah);
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

function parseHitbox(rawWord: RawWord, index: number): MushafWordHitbox | null {
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

  const locationData = parseLocation(rawWord, index);
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
