import { access, readFile } from "node:fs/promises";
import path from "node:path";
import type { MushafPageManifest, MushafWordHitbox } from "@/types/mushaf";

type PageVariant = "page" | "thumb";
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

export async function pageImageExists(
  pageNumber: number,
  variant: PageVariant = "page",
): Promise<boolean> {
  const imagePath = await resolvePageImagePath(pageNumber, variant);
  return imagePath !== null;
}

export async function loadPageManifest(
  pageNumber: number,
): Promise<MushafPageManifest | null> {
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

