import { readFile } from "node:fs/promises";
import path from "node:path";
import type {
  MushafAyahManifest,
  MushafPageManifest,
  MushafWordHitbox,
} from "@/mushaf/types/mushaf";
import { findExistingAssetFile } from "./mushafAssetFiles";
import {
  getAyahManifestFilename,
  getManifestFilename,
  getRemoteManifestBaseUrl,
  joinAssetUrl,
} from "./mushafAssetUrls";

type RawManifest = Record<string, unknown>;
type RawWord = Record<string, unknown>;

const MANIFEST_DIRS = [
  path.resolve("assets/manifests"),
  path.resolve("manifests"),
  path.resolve("test/golden/manifests"),
];

const DEFAULT_WIDTH = 1200;
const DEFAULT_HEIGHT = 1920;

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function toPositiveInt(value: unknown): number | undefined {
  const parsed = toFiniteNumber(value);
  if (parsed === null || parsed <= 0) return undefined;
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

  return { location: `unknown:${index + 1}`, surah, ayah, wordPosition };
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

  return {
    ...parseLocation(rawWord, index, defaults),
    x,
    y,
    width,
    height,
    text: typeof rawWord.text === "string" ? rawWord.text : undefined,
    wordId: toPositiveInt(rawWord.word_id ?? rawWord.wordId),
  };
}

function normalizeManifest(
  rawManifest: RawManifest,
  fallbackPageNumber: number,
): MushafPageManifest | null {
  const imageWidth =
    toFiniteNumber(rawManifest.image_width ?? rawManifest.imageWidth) ?? DEFAULT_WIDTH;
  const imageHeight =
    toFiniteNumber(rawManifest.image_height ?? rawManifest.imageHeight) ?? DEFAULT_HEIGHT;
  const page =
    toPositiveInt(rawManifest.page) ??
    toPositiveInt(rawManifest.page_number) ??
    fallbackPageNumber;
  const schemaVersion =
    typeof rawManifest.schema_version === "string"
      ? rawManifest.schema_version
      : "1.0.0";

  if (imageWidth <= 0 || imageHeight <= 0 || page <= 0) return null;

  const words = Array.isArray(rawManifest.words)
    ? rawManifest.words
        .map((word, index) => {
          if (!word || typeof word !== "object") return null;
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
    toFiniteNumber(rawManifest.image_width ?? rawManifest.imageWidth) ?? DEFAULT_WIDTH;
  const imageHeight =
    toFiniteNumber(rawManifest.image_height ?? rawManifest.imageHeight) ?? DEFAULT_HEIGHT;
  const surah = toPositiveInt(rawManifest.surah) ?? fallbackSurah;
  const ayah = toPositiveInt(rawManifest.ayah) ?? fallbackAyah;
  const schemaVersion =
    typeof rawManifest.schema_version === "string"
      ? rawManifest.schema_version
      : "1.0.0";

  if (imageWidth <= 0 || imageHeight <= 0 || surah <= 0 || ayah <= 0) return null;

  const words = Array.isArray(rawManifest.words)
    ? rawManifest.words
        .map((word, index) => {
          if (!word || typeof word !== "object") return null;
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

async function loadRemoteManifest(
  manifestUrl: string,
  pageNumber: number,
): Promise<MushafPageManifest | null> {
  try {
    const response = await fetch(manifestUrl, { cache: "force-cache" });
    if (!response.ok) return null;
    return normalizeManifest((await response.json()) as RawManifest, pageNumber);
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
    const response = await fetch(manifestUrl, { cache: "force-cache" });
    if (!response.ok) return null;
    return normalizeAyahManifest((await response.json()) as RawManifest, surah, ayah);
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
      joinAssetUrl(manifestBaseUrl, getManifestFilename(pageNumber)),
      pageNumber,
    );
    if (remoteManifest) return remoteManifest;
  }

  const filename = getManifestFilename(pageNumber);
  const manifestPath = await findExistingAssetFile(MANIFEST_DIRS, filename);
  if (!manifestPath) return null;

  try {
    return normalizeManifest(
      JSON.parse(await readFile(manifestPath, "utf-8")) as RawManifest,
      pageNumber,
    );
  } catch {
    return null;
  }
}

export async function loadAyahManifest(
  surah: number,
  ayah: number,
): Promise<MushafAyahManifest | null> {
  if (!Number.isInteger(surah) || !Number.isInteger(ayah) || surah <= 0 || ayah <= 0) {
    return null;
  }

  const manifestBaseUrl = getRemoteManifestBaseUrl();
  if (manifestBaseUrl) {
    const remoteManifest = await loadRemoteAyahManifest(
      joinAssetUrl(manifestBaseUrl, getAyahManifestFilename(surah, ayah)),
      surah,
      ayah,
    );
    if (remoteManifest) return remoteManifest;
  }

  const filename = getAyahManifestFilename(surah, ayah);
  const manifestPath = await findExistingAssetFile(MANIFEST_DIRS, filename);
  if (!manifestPath) return null;

  try {
    return normalizeAyahManifest(
      JSON.parse(await readFile(manifestPath, "utf-8")) as RawManifest,
      surah,
      ayah,
    );
  } catch {
    return null;
  }
}
