import { readFile } from "node:fs/promises";
import path from "node:path";
import type { MushafWordTranslationMap } from "@/types/mushaf";

type RawTranslationMap = Record<string, unknown>;

const BM_WBW_PATH = path.resolve("data/bm_wbw_complete.json");
const EN_WBW_PATH = path.resolve("data/qul/english-wbw-translation.json");

let bmCachePromise: Promise<Record<string, string>> | null = null;
let enCachePromise: Promise<Record<string, string>> | null = null;

async function loadTranslationFile(filePath: string): Promise<Record<string, string>> {
  try {
    const rawText = await readFile(filePath, "utf-8");
    const parsed = JSON.parse(rawText) as RawTranslationMap;
    const map: Record<string, string> = {};

    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value !== "string") {
        continue;
      }
      const normalizedKey = key.trim();
      const normalizedValue = value.trim();
      if (normalizedKey.length === 0 || normalizedValue.length === 0) {
        continue;
      }
      map[normalizedKey] = normalizedValue;
    }

    return map;
  } catch {
    return {};
  }
}

async function loadBmMap(): Promise<Record<string, string>> {
  if (!bmCachePromise) {
    bmCachePromise = loadTranslationFile(BM_WBW_PATH);
  }
  return bmCachePromise;
}

async function loadEnMap(): Promise<Record<string, string>> {
  if (!enCachePromise) {
    enCachePromise = loadTranslationFile(EN_WBW_PATH);
  }
  return enCachePromise;
}

export async function getWordTranslationsByLocation(
  locations: string[],
): Promise<MushafWordTranslationMap> {
  const uniqueLocations = Array.from(
    new Set(locations.map((location) => location.trim()).filter(Boolean)),
  );

  if (uniqueLocations.length === 0) {
    return {};
  }

  const [bmMap, enMap] = await Promise.all([loadBmMap(), loadEnMap()]);
  const result: MushafWordTranslationMap = {};

  for (const location of uniqueLocations) {
    const bm = bmMap[location];
    const en = enMap[location];
    if (!bm && !en) {
      continue;
    }

    result[location] = {
      location,
      bm,
      en,
    };
  }

  return result;
}
