"use client";

import { CACHE_DATA } from "@/lib/pwa/offlineBundle";
import {
  buildTierVocabUrl,
  clearTierVocabMarker,
  getFahamTierVocabPackageMarker,
  isTierVocabMarkerCurrent,
  readTierVocabMarker,
  resolveRequestedWordLimit,
  writeTierVocabMarker,
} from "./tierVocabMarker";
import { parseTierVocabPayload } from "./tierVocabPayload";
import type {
  CachedFahamTierVocabPayload,
  PrefetchFahamTierVocabResult,
} from "./tierVocabTypes";

export { getFahamTierVocabPackageMarker };

export async function clearCachedFahamTierVocabPackage(): Promise<void> {
  clearTierVocabMarker();

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
  const marker = readTierVocabMarker();

  if (
    isTierVocabMarkerCurrent({
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
      const payload = parseTierVocabPayload(await existing.clone().json());
      if (payload && payload.ok) {
        writeTierVocabMarker({
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

  const payload = parseTierVocabPayload(await response.clone().json());
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
  writeTierVocabMarker({
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
  const marker = readTierVocabMarker();
  if (
    !isTierVocabMarkerCurrent({
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

  const payload = parseTierVocabPayload(await response.clone().json());
  if (!payload || !payload.ok) {
    return null;
  }

  return payload;
}
