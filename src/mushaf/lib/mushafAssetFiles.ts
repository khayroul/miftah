import { access } from "node:fs/promises";
import path from "node:path";
import {
  getAyahFilename,
  getPageFilename,
  getRemoteAyahImageUrl,
  getRemotePageImageUrl,
  getRemoteWordImageUrl,
  getWordFilename,
  type MushafPageImageSource,
  type PageVariant,
} from "./mushafAssetUrls";

const PAGE_IMAGE_DIRS = [
  path.resolve("assets/pages"),
  path.resolve("test/pages"),
  path.resolve("test/golden/pages"),
];

const AYAH_IMAGE_DIRS = [
  path.resolve("assets/ayat"),
  path.resolve("test/golden/ayat"),
];

const DEFAULT_WORDS_DIR = `assets${path.sep}words`;
const LEGACY_WORDS_DIR = "words";
const GOLDEN_WORDS_DIR = `test${path.sep}golden${path.sep}words`;

const WORD_IMAGE_DIRS = [
  path.join(process.cwd(), DEFAULT_WORDS_DIR),
  path.join(process.cwd(), LEGACY_WORDS_DIR),
  path.join(process.cwd(), GOLDEN_WORDS_DIR),
];

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function findExistingAssetFile(
  dirs: string[],
  filename: string,
): Promise<string | null> {
  const candidates = dirs.map((dir) => path.join(dir, filename));
  const results = await Promise.all(candidates.map(fileExists));
  const foundIndex = results.indexOf(true);
  return foundIndex >= 0 ? candidates[foundIndex] : null;
}

export async function resolvePageImagePath(
  pageNumber: number,
  variant: PageVariant = "page",
): Promise<string | null> {
  return findExistingAssetFile(PAGE_IMAGE_DIRS, getPageFilename(pageNumber, variant));
}

export async function resolveAyahImagePath(
  surah: number,
  ayah: number,
): Promise<string | null> {
  if (!Number.isInteger(surah) || !Number.isInteger(ayah) || surah <= 0 || ayah <= 0) {
    return null;
  }
  return findExistingAssetFile(AYAH_IMAGE_DIRS, getAyahFilename(surah, ayah));
}

export async function resolveAyahImageSource(
  surah: number,
  ayah: number,
): Promise<MushafPageImageSource | null> {
  const remoteUrl = getRemoteAyahImageUrl(surah, ayah);
  if (remoteUrl) return { kind: "remote", url: remoteUrl };

  const localPath = await resolveAyahImagePath(surah, ayah);
  return localPath ? { kind: "local", path: localPath } : null;
}

export async function ayahImageExists(surah: number, ayah: number): Promise<boolean> {
  if (getRemoteAyahImageUrl(surah, ayah)) return true;
  return (await resolveAyahImagePath(surah, ayah)) !== null;
}

export async function resolvePageImageSource(
  pageNumber: number,
  variant: PageVariant = "page",
): Promise<MushafPageImageSource | null> {
  const remoteUrl = getRemotePageImageUrl(pageNumber, variant);
  if (remoteUrl) return { kind: "remote", url: remoteUrl };

  const localPath = await resolvePageImagePath(pageNumber, variant);
  return localPath ? { kind: "local", path: localPath } : null;
}

export async function pageImageExists(
  pageNumber: number,
  variant: PageVariant = "page",
): Promise<boolean> {
  if (getRemotePageImageUrl(pageNumber, variant)) return true;
  return (await resolvePageImagePath(pageNumber, variant)) !== null;
}

export async function resolveWordImagePath(wordId: number): Promise<string | null> {
  if (!Number.isInteger(wordId) || wordId <= 0) return null;
  return findExistingAssetFile(WORD_IMAGE_DIRS, getWordFilename(wordId));
}

export async function resolveWordImageSource(
  wordId: number,
): Promise<MushafPageImageSource | null> {
  const localPath = await resolveWordImagePath(wordId);
  if (localPath) return { kind: "local", path: localPath };

  const remoteUrl = getRemoteWordImageUrl(wordId);
  return remoteUrl ? { kind: "remote", url: remoteUrl } : null;
}

export async function wordImageExists(wordId: number): Promise<boolean> {
  if (getRemoteWordImageUrl(wordId)) return true;
  return (await resolveWordImagePath(wordId)) !== null;
}
