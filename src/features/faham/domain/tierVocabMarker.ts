import type { FahamTierVocabPackageMarker } from "./tierVocabTypes";

const LS_KEY_TIER_VOCAB_MARKER = "miftah:faham-tier-vocab-package";

function getStorage(): Storage | null {
  if (typeof localStorage === "undefined") {
    return null;
  }

  try {
    return localStorage;
  } catch {
    return null;
  }
}

function parseJson(raw: string): unknown | null {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function isPositiveInt(value: unknown): value is number {
  return isFiniteNumber(value) && Number.isInteger(value) && value > 0;
}

function parseMarker(raw: string): FahamTierVocabPackageMarker | null {
  const parsed = parseJson(raw);
  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }

  const record = parsed as Record<string, unknown>;
  const appBuildId = record.appBuildId;
  const dataVersion = record.dataVersion;
  const updatedAt = record.updatedAt;
  const wordLimit = record.wordLimit;

  if (
    typeof appBuildId !== "string" ||
    typeof dataVersion !== "string" ||
    !isFiniteNumber(updatedAt) ||
    !isPositiveInt(wordLimit)
  ) {
    return null;
  }

  return {
    appBuildId,
    dataVersion,
    updatedAt,
    wordLimit,
  };
}

export function readTierVocabMarker(): FahamTierVocabPackageMarker | null {
  const storage = getStorage();
  if (!storage) {
    return null;
  }

  const raw = storage.getItem(LS_KEY_TIER_VOCAB_MARKER);
  if (!raw) {
    return null;
  }

  const marker = parseMarker(raw);
  if (!marker) {
    storage.removeItem(LS_KEY_TIER_VOCAB_MARKER);
    return null;
  }

  return marker;
}

export function getFahamTierVocabPackageMarker(): FahamTierVocabPackageMarker | null {
  const marker = readTierVocabMarker();
  if (!marker) {
    return null;
  }

  return {
    appBuildId: marker.appBuildId,
    dataVersion: marker.dataVersion,
    updatedAt: marker.updatedAt,
    wordLimit: marker.wordLimit,
  };
}

export function writeTierVocabMarker(marker: FahamTierVocabPackageMarker): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  try {
    storage.setItem(LS_KEY_TIER_VOCAB_MARKER, JSON.stringify(marker));
  } catch {
    // Ignore storage failures.
  }
}

export function clearTierVocabMarker(): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }
  storage.removeItem(LS_KEY_TIER_VOCAB_MARKER);
}

export function resolveRequestedWordLimit(value: number | undefined): number | null {
  if (value === undefined) {
    return null;
  }
  return isPositiveInt(value) ? value : null;
}

export function buildTierVocabUrl(dataVersion: string, wordLimit: number | null): string {
  const params = new URLSearchParams();
  params.set("v", dataVersion);
  if (wordLimit !== null) {
    params.set("limit", String(wordLimit));
  }
  return `/api/faham/tier-vocab?${params.toString()}`;
}

export function isTierVocabMarkerCurrent(params: {
  appBuildId: string;
  dataVersion: string;
  marker: FahamTierVocabPackageMarker | null;
  requestedWordLimit: number | null;
}): boolean {
  const { appBuildId, dataVersion, marker, requestedWordLimit } = params;
  if (!marker) {
    return false;
  }
  if (marker.appBuildId !== appBuildId || marker.dataVersion !== dataVersion) {
    return false;
  }
  if (requestedWordLimit !== null && marker.wordLimit < requestedWordLimit) {
    return false;
  }
  return true;
}
