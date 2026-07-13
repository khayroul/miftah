"use client";

import { useEffect, useRef, useState } from "react";
import { preCacheAudioUrls, type HifzExerciseFlow, type HifzFlowType } from "@/features/hifz";
import type { MushafAyahDetail, MushafLayoutPage, MushafPageManifest } from "@/mushaf";
import type { ReadAudioTrack } from "../domain/audio/pageAudioTracks";
import { rememberLastReadPage } from "../domain/readingProgressStorage";

function scheduleIdleTask(callback: () => void, timeoutMs = 1200): () => void {
  if (typeof window === "undefined") return () => {};
  if ("requestIdleCallback" in window) {
    const idleId = window.requestIdleCallback(callback, { timeout: timeoutMs });
    return () => window.cancelIdleCallback(idleId);
  }
  const timerId = globalThis.setTimeout(callback, timeoutMs);
  return () => globalThis.clearTimeout(timerId);
}

interface UseReadPageHydrationInput {
  audioEnabled: boolean;
  audioTracks: ReadAudioTrack[];
  ayahDetails: MushafAyahDetail[];
  exercise: HifzExerciseFlow | null;
  flow: HifzFlowType | null;
  initialMemorizedAyahKeys: string[];
  layout: MushafLayoutPage;
  memorizeChunkAyahKeys: string[] | null;
  pageNumber: number;
  personalizationPageNumber: number | null;
  readingAyahIds: number[];
  setAudioVisible: (visible: boolean) => void;
  setPlayableAyahKeys: (keys: string[] | null) => void;
  syncAudioTracks: (pageNumber: number, tracks: ReadAudioTrack[]) => void;
}

export function useReadPageHydration(input: UseReadPageHydrationInput) {
  const [alignData, setAlignData] = useState<unknown[]>([]);
  const [isImageReady, setIsImageReady] = useState(false);
  const [pageManifest, setPageManifest] = useState<MushafPageManifest | null>(null);
  const [resolvedMemorizedAyahKeys, setResolvedMemorizedAyahKeys] = useState(input.initialMemorizedAyahKeys);
  const [shouldTrackExposure, setShouldTrackExposure] = useState(false);
  const lastSyncedPageRef = useRef<number | null>(null);

  useEffect(() => {
    rememberLastReadPage(input.pageNumber);
  }, [input.pageNumber]);
  useEffect(() => setIsImageReady(false), [input.pageNumber]);
  useEffect(() => setResolvedMemorizedAyahKeys(input.initialMemorizedAyahKeys), [input.initialMemorizedAyahKeys]);

  useEffect(() => {
    if (input.flow !== null || !isImageReady || lastSyncedPageRef.current === input.pageNumber) return;
    lastSyncedPageRef.current = input.pageNumber;
    return scheduleIdleTask(() => {
      void fetch("/api/reading/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page: input.pageNumber }),
        keepalive: true,
      }).catch((error: unknown) => console.error("[ReadPageWorkspace] Failed to sync reading state:", error));
    }, 900);
  }, [input.flow, input.pageNumber, isImageReady]);

  useEffect(() => {
    if (input.flow !== null || !isImageReady) {
      setShouldTrackExposure(false);
      return;
    }
    return scheduleIdleTask(() => setShouldTrackExposure(true), 1500);
  }, [input.flow, input.pageNumber, isImageReady]);

  useEffect(() => {
    if (!input.audioEnabled) {
      input.setAudioVisible(false);
      input.setPlayableAyahKeys(null);
      input.syncAudioTracks(input.pageNumber, []);
      return;
    }
    input.syncAudioTracks(input.pageNumber, input.audioTracks);
  // The individual stable fields are intentional; the aggregate input object is recreated by the caller.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input.audioEnabled, input.audioTracks, input.pageNumber, input.setAudioVisible, input.setPlayableAyahKeys, input.syncAudioTracks]);

  useEffect(() => {
    input.setPlayableAyahKeys(input.flow === "memorize" ? input.memorizeChunkAyahKeys : null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input.flow, input.memorizeChunkAyahKeys, input.setPlayableAyahKeys]);

  useEffect(() => {
    if (input.flow === null || input.audioTracks.length === 0) return;
    void preCacheAudioUrls(input.audioTracks.map((track) => track.audioUrl));
  }, [input.flow, input.audioTracks]);

  useEffect(() => {
    if (input.exercise !== "tebuk" && input.exercise !== "unveil") {
      setAlignData([]);
      return;
    }
    const controller = new AbortController();
    void fetch("/data/quran-align-alafasy.json", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Failed to load align data");
        return (await response.json()) as Array<{ surah: number; ayah: number; segments: [number, number, number, number][] }>;
      })
      .then((allData) => {
        const pageAyahKeys = new Set<string>();
        for (const line of input.layout.lines) {
          if (line.type !== "text") continue;
          for (const word of line.words ?? []) {
            const [surah, ayah] = word.location.split(":");
            if (surah && ayah) pageAyahKeys.add(`${surah}:${ayah}`);
          }
        }
        setAlignData(allData.filter((entry) => pageAyahKeys.has(`${entry.surah}:${entry.ayah}`)));
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        console.error("[ReadPageWorkspace] Failed to load align data", error);
        setAlignData([]);
      });
    return () => controller.abort();
  }, [input.exercise, input.layout, input.pageNumber]);

  useEffect(() => {
    if (input.exercise !== "unveil") {
      setPageManifest(null);
      return;
    }
    const controller = new AbortController();
    void fetch(`/api/mushaf/manifest/${input.pageNumber}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Failed to load page manifest");
        return (await response.json()) as MushafPageManifest;
      })
      .then(setPageManifest)
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        console.error("[ReadPageWorkspace] Failed to load page manifest", error);
        setPageManifest(null);
      });
    return () => controller.abort();
  }, [input.exercise, input.pageNumber]);

  useEffect(() => {
    if (!input.personalizationPageNumber || input.flow === null) return;
    const controller = new AbortController();
    const cancelIdle = scheduleIdleTask(() => {
      void fetch("/api/read/personalization", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ayahIds: input.readingAyahIds }),
        cache: "no-store",
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) throw new Error("Read personalization request failed");
          return (await response.json()) as { memorizedAyahIds?: number[] };
        })
        .then((payload) => {
          if (!Array.isArray(payload.memorizedAyahIds)) return;
          const ids = new Set(payload.memorizedAyahIds);
          setResolvedMemorizedAyahKeys(input.ayahDetails.filter((ayah) => ids.has(ayah.id)).map((ayah) => ayah.key));
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          console.error("[read/page] Failed to hydrate memorized ayah keys", error);
        });
    }, 1800);
    return () => {
      cancelIdle();
      controller.abort();
    };
  }, [input.ayahDetails, input.flow, input.personalizationPageNumber, input.readingAyahIds]);

  return { alignData, isImageReady, pageManifest, resolvedMemorizedAyahKeys, setIsImageReady, shouldTrackExposure };
}
