import { readFile } from "node:fs/promises";
import path from "node:path";
import type { MushafWordHitbox, MushafWordTranslationMap } from "@/types/mushaf";

type RawTranslationMap = Record<string, unknown>;

const BM_WBW_PATH = path.resolve("data/bm_wbw_complete.json");
const EN_WBW_PATH = path.resolve("data/qul/english-wbw-translation.json");

let bmCachePromise: Promise<Record<string, string>> | null = null;
let enCachePromise: Promise<Record<string, string>> | null = null;
let ayahPositionCachePromise: Promise<Record<string, number[]>> | null = null;

interface ParsedLocation {
  surah: number;
  ayah: number;
  position: number;
}

interface WordAlignmentCandidate {
  hitbox: MushafWordHitbox;
  location: string;
  position: number;
  order: number;
}

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

function parseLocation(location: string): ParsedLocation | null {
  const trimmed = location.trim();
  const match = trimmed.match(/^(\d+):(\d+):(\d+)$/);
  if (!match) {
    return null;
  }
  const surah = Number.parseInt(match[1], 10);
  const ayah = Number.parseInt(match[2], 10);
  const position = Number.parseInt(match[3], 10);
  if (!surah || !ayah || !position) {
    return null;
  }
  return { surah, ayah, position };
}

function buildAyahPositionMap(
  bmMap: Record<string, string>,
  enMap: Record<string, string>,
): Record<string, number[]> {
  const map = new Map<string, Set<number>>();
  const allKeys = new Set([...Object.keys(bmMap), ...Object.keys(enMap)]);

  for (const key of allKeys) {
    const parsed = parseLocation(key);
    if (!parsed) {
      continue;
    }
    const ayahKey = `${parsed.surah}:${parsed.ayah}`;
    const positions = map.get(ayahKey) ?? new Set<number>();
    positions.add(parsed.position);
    map.set(ayahKey, positions);
  }

  const result: Record<string, number[]> = {};
  for (const [ayahKey, positions] of map.entries()) {
    result[ayahKey] = Array.from(positions).sort((a, b) => a - b);
  }
  return result;
}

async function loadAyahPositionMap(): Promise<Record<string, number[]>> {
  if (!ayahPositionCachePromise) {
    ayahPositionCachePromise = Promise.all([loadBmMap(), loadEnMap()]).then(
      ([bmMap, enMap]) => buildAyahPositionMap(bmMap, enMap),
    );
  }
  return ayahPositionCachePromise;
}

function candidateWordPosition(hitbox: MushafWordHitbox): number | null {
  if (typeof hitbox.wordPosition === "number" && Number.isFinite(hitbox.wordPosition)) {
    const parsed = Math.trunc(hitbox.wordPosition);
    return parsed > 0 ? parsed : null;
  }
  const parsedLocation = parseLocation(hitbox.location);
  return parsedLocation?.position ?? null;
}

function isLikelyDecorativeGlyph(hitbox: MushafWordHitbox): boolean {
  const area = hitbox.width * hitbox.height;
  return hitbox.width <= 8 || area <= 420;
}

function alignCandidatesToExpectedPositions(
  candidates: WordAlignmentCandidate[],
  expectedPositions: number[],
): Array<{ candidate: WordAlignmentCandidate; expectedPosition: number }> | null {
  const candidateCount = candidates.length;
  const expectedCount = expectedPositions.length;

  if (expectedCount === 0 || candidateCount < expectedCount) {
    return null;
  }

  const dp: number[][] = Array.from({ length: expectedCount + 1 }, () =>
    Array.from({ length: candidateCount + 1 }, () => Number.POSITIVE_INFINITY),
  );
  const choice: number[][] = Array.from({ length: expectedCount + 1 }, () =>
    Array.from({ length: candidateCount + 1 }, () => 0),
  );

  for (let j = 0; j <= candidateCount; j += 1) {
    dp[0][j] = 0;
  }

  for (let i = 1; i <= expectedCount; i += 1) {
    for (let j = 1; j <= candidateCount; j += 1) {
      const skipCost = dp[i][j - 1];
      const matchCost =
        dp[i - 1][j - 1] +
        Math.abs(candidates[j - 1].position - expectedPositions[i - 1]);

      if (matchCost <= skipCost) {
        dp[i][j] = matchCost;
        choice[i][j] = 1;
      } else {
        dp[i][j] = skipCost;
        choice[i][j] = 0;
      }
    }
  }

  if (!Number.isFinite(dp[expectedCount][candidateCount])) {
    return null;
  }

  const aligned: Array<{
    candidate: WordAlignmentCandidate;
    expectedPosition: number;
  }> = [];

  let i = expectedCount;
  let j = candidateCount;
  while (i > 0 && j > 0) {
    if (choice[i][j] === 1) {
      aligned.push({
        candidate: candidates[j - 1],
        expectedPosition: expectedPositions[i - 1],
      });
      i -= 1;
      j -= 1;
      continue;
    }
    j -= 1;
  }

  if (i !== 0) {
    return null;
  }

  aligned.reverse();
  return aligned;
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

export async function getWordTranslationsByHitboxes(
  hitboxes: MushafWordHitbox[],
): Promise<MushafWordTranslationMap> {
  const [bmMap, enMap, ayahPositionMap] = await Promise.all([
    loadBmMap(),
    loadEnMap(),
    loadAyahPositionMap(),
  ]);

  const result: MushafWordTranslationMap = {};
  if (hitboxes.length === 0) {
    return result;
  }

  const groups = new Map<string, WordAlignmentCandidate[]>();
  for (const [index, hitbox] of hitboxes.entries()) {
    const parsed = parseLocation(hitbox.location);
    if (!parsed) {
      const bm = bmMap[hitbox.location];
      const en = enMap[hitbox.location];
      if (!bm && !en) {
        continue;
      }
      result[hitbox.location] = {
        location: hitbox.location,
        bm,
        en,
      };
      continue;
    }

    const ayahKey = `${parsed.surah}:${parsed.ayah}`;
    const position = candidateWordPosition(hitbox);
    if (!position) {
      const bm = bmMap[hitbox.location];
      const en = enMap[hitbox.location];
      if (!bm && !en) {
        continue;
      }
      result[hitbox.location] = {
        location: hitbox.location,
        bm,
        en,
      };
      continue;
    }

    const list = groups.get(ayahKey) ?? [];
    list.push({
      hitbox,
      location: hitbox.location,
      position,
      order: index,
    });
    groups.set(ayahKey, list);
  }

  for (const [ayahKey, candidates] of groups.entries()) {
    const expectedPositions = ayahPositionMap[ayahKey] ?? [];
    if (expectedPositions.length === 0) {
      for (const candidate of candidates) {
        const bm = bmMap[candidate.location];
        const en = enMap[candidate.location];
        if (!bm && !en) {
          continue;
        }
        result[candidate.location] = {
          location: candidate.location,
          bm,
          en,
        };
      }
      continue;
    }

    const filteredCandidates = candidates.filter(
      (candidate) => !isLikelyDecorativeGlyph(candidate.hitbox),
    );
    const baseCandidates =
      filteredCandidates.length >= expectedPositions.length
        ? filteredCandidates
        : candidates;
    const sortedCandidates = [...baseCandidates].sort((a, b) => a.order - b.order);

    const aligned = alignCandidatesToExpectedPositions(
      sortedCandidates,
      expectedPositions,
    );

    if (!aligned) {
      for (const candidate of candidates) {
        const bm = bmMap[candidate.location];
        const en = enMap[candidate.location];
        if (!bm && !en) {
          continue;
        }
        result[candidate.location] = {
          location: candidate.location,
          bm,
          en,
        };
      }
      continue;
    }

    for (const match of aligned) {
      const [surah, ayah] = ayahKey.split(":");
      if (!surah || !ayah) {
        continue;
      }
      const canonicalLocation = `${surah}:${ayah}:${match.expectedPosition}`;
      const bm = bmMap[canonicalLocation];
      const en = enMap[canonicalLocation];
      if (!bm && !en) {
        continue;
      }

      result[match.candidate.location] = {
        location: match.candidate.location,
        bm,
        en,
      };
    }
  }

  return result;
}
