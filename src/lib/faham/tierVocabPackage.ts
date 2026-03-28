"use client";

import { CACHE_DATA } from "@/lib/pwa/offlineBundle";

const LS_KEY_TIER_VOCAB_MARKER = "miftah:faham-tier-vocab-package";

interface FahamTierVocabPackageMarker {
  appBuildId: string;
  dataVersion: string;
  updatedAt: number;
  wordLimit: number;
}

interface FahamTierVocabWordPayload {
  frequency: number;
  id: number;
  textSimple: string;
  textUthmani: string;
  translationBm: string | null;
  translationEn: string | null;
  transliteration: string | null;
}

export interface CachedFahamTierVocabPayload {
  dataVersion: string;
  generatedAt: string;
  level: number;
  maxLevel: number;
  ok: true;
  wordLimit: number;
  words: FahamTierVocabWordPayload[];
}

interface UnauthenticatedTierVocabPayload {
  dataVersion: string;
  ok: false;
  reason: "unauthenticated";
}

type TierVocabPayload = CachedFahamTierVocabPayload | UnauthenticatedTierVocabPayload;

export interface PrefetchFahamTierVocabResult {
  reason?: string;
  status: "already-current" | "cached" | "skipped";
  wordLimit: number | null;
}

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

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isPositiveInt(value: unknown): value is number {
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

function readMarker(): FahamTierVocabPackageMarker | null {
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

export function getFahamTierVocabPackageMarker(): {
  appBuildId: string;
  dataVersion: string;
  updatedAt: number;
  wordLimit: number;
} | null {
  const marker = readMarker();
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

function writeMarker(marker: FahamTierVocabPackageMarker): void {
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

function clearMarker(): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }
  storage.removeItem(LS_KEY_TIER_VOCAB_MARKER);
}

function resolveRequestedWordLimit(value: number | undefined): number | null {
  if (value === undefined) {
    return null;
  }
  return isPositiveInt(value) ? value : null;
}

function buildTierVocabUrl(dataVersion: string, wordLimit: number | null): string {
  const params = new URLSearchParams();
  params.set("v", dataVersion);
  if (wordLimit !== null) {
    params.set("limit", String(wordLimit));
  }
  return `/api/faham/tier-vocab?${params.toString()}`;
}

function isFahamTierVocabWordPayload(value: unknown): value is FahamTierVocabWordPayload {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    isPositiveInt(record.id) &&
    isFiniteNumber(record.frequency) &&
    typeof record.textSimple === "string" &&
    typeof record.textUthmani === "string" &&
    (typeof record.translationBm === "string" || record.translationBm === null) &&
    (typeof record.translationEn === "string" || record.translationEn === null) &&
    (typeof record.transliteration === "string" || record.transliteration === null)
  );
}

function isCachedTierPayload(value: unknown): value is CachedFahamTierVocabPayload {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    record.ok === true &&
    typeof record.dataVersion === "string" &&
    typeof record.generatedAt === "string" &&
    isPositiveInt(record.level) &&
    isPositiveInt(record.maxLevel) &&
    isPositiveInt(record.wordLimit) &&
    Array.isArray(record.words) &&
    record.words.every(isFahamTierVocabWordPayload)
  );
}

function isUnauthenticatedPayload(value: unknown): value is UnauthenticatedTierVocabPayload {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    record.ok === false &&
    record.reason === "unauthenticated" &&
    typeof record.dataVersion === "string"
  );
}

function parseTierPayload(value: unknown): TierVocabPayload | null {
  if (isCachedTierPayload(value)) {
    return value;
  }
  if (isUnauthenticatedPayload(value)) {
    return value;
  }
  return null;
}

function isMarkerCurrent(params: {
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

export async function clearCachedFahamTierVocabPackage(): Promise<void> {
  clearMarker();

  const cache = await caches.open(CACHE_DATA);
  const keys = await cache.keys();
  await Promise.all(
    keys
      .filter((request) => new URL(request.url).pathname === "/api/faham/tier-vocab")
      .map((request) => cache.delete(request)),
  );
}

export async function prefetchFahamTierVocabPackage(params: {
  appBuildId: string;
  controller?: AbortController;
  dataVersion: string;
  requestedWordLimit?: number;
}): Promise<PrefetchFahamTierVocabResult> {
  const requestedWordLimit = resolveRequestedWordLimit(params.requestedWordLimit);
  const marker = readMarker();

  if (
    isMarkerCurrent({
      appBuildId: params.appBuildId,
      dataVersion: params.dataVersion,
      marker,
      requestedWordLimit,
    })
  ) {
    return {
      status: "already-current",
      wordLimit: marker?.wordLimit ?? null,
    };
  }

  const url = buildTierVocabUrl(params.dataVersion, requestedWordLimit);
  const cache = await caches.open(CACHE_DATA);
  const existing = await cache.match(url);
  if (existing) {
    try {
      const payload = parseTierPayload(await existing.clone().json());
      if (payload && payload.ok) {
        writeMarker({
          appBuildId: params.appBuildId,
          dataVersion: payload.dataVersion,
          updatedAt: Date.now(),
          wordLimit: payload.wordLimit,
        });
        return {
          status: "already-current",
          wordLimit: payload.wordLimit,
        };
      }
    } catch {
      // Ignore malformed cache; fetch a clean copy.
    }
  }

  let response: Response;
  try {
    response = await fetch(url, {
      signal: params.controller?.signal,
    });
  } catch {
    return {
      reason: "network_error",
      status: "skipped",
      wordLimit: null,
    };
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      return {
        reason: "unauthenticated",
        status: "skipped",
        wordLimit: null,
      };
    }
    return {
      reason: "http_error",
      status: "skipped",
      wordLimit: null,
    };
  }

  const payload = parseTierPayload(await response.clone().json());
  if (payload === null) {
    return {
      reason: "invalid_payload",
      status: "skipped",
      wordLimit: null,
    };
  }

  if (!payload.ok) {
    return {
      reason: payload.reason,
      status: "skipped",
      wordLimit: null,
    };
  }

  await cache.put(url, response.clone());
  writeMarker({
    appBuildId: params.appBuildId,
    dataVersion: payload.dataVersion,
    updatedAt: Date.now(),
    wordLimit: payload.wordLimit,
  });

  return {
    status: "cached",
    wordLimit: payload.wordLimit,
  };
}

export async function loadCachedFahamTierVocabPackage(params: {
  appBuildId: string;
  dataVersion: string;
  requestedWordLimit?: number;
}): Promise<CachedFahamTierVocabPayload | null> {
  const requestedWordLimit = resolveRequestedWordLimit(params.requestedWordLimit);
  const marker = readMarker();
  if (
    !isMarkerCurrent({
      appBuildId: params.appBuildId,
      dataVersion: params.dataVersion,
      marker,
      requestedWordLimit,
    })
  ) {
    return null;
  }
  if (marker === null) {
    return null;
  }

  const cache = await caches.open(CACHE_DATA);
  const url = buildTierVocabUrl(params.dataVersion, marker.wordLimit);
  const response = await cache.match(url);
  if (!response) {
    return null;
  }

  const payload = parseTierPayload(await response.clone().json());
  if (!payload || !payload.ok) {
    return null;
  }

  return payload;
}
