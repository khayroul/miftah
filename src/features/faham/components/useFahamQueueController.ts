"use client";

/* eslint-disable react-hooks/immutability, react-hooks/exhaustive-deps -- shared refs and explicit stable setters preserve the original single-controller lifecycle */

import { useCallback, useEffect, useRef } from "react";
import { loadCachedFahamStats } from "../domain/offlineSync";
import { buildOfflineFahamQueueSnapshot } from "../domain/offlineQueue";
import type { FahamMcqDirectionMode } from "../domain/mcq";
import type { FahamSourcePreset } from "../domain/presets";
import {
  countQueueCards,
  isRestorableFahamQueue,
  loadMatchingCachedQueue,
  requestQueue,
  saveRestorableCachedQueue,
  type FahamStats,
} from "./fahamWorkspaceSupport";
import type { FahamStatsController } from "./useFahamStatsController";
import type { FahamWorkspaceState } from "./useFahamWorkspaceState";

export function useFahamQueueController(
  state: FahamWorkspaceState,
  stats: FahamStatsController,
  initial: {
    initialPreset: FahamSourcePreset;
    initialQueue: FahamWorkspaceState["snapshot"];
    initialStats: FahamStats | null;
    shouldHydrateInitialQueue: boolean;
  },
) {
  const levelProgressRef = useRef(state.levelProgress);
  useEffect(() => {
    levelProgressRef.current = state.levelProgress;
  }, [state.levelProgress]);

  const resetSessionTracking = useCallback(() => {
    state.sessionCorrectCountRef.current = 0;
  }, [state.sessionCorrectCountRef]);

  const requestQueueWithFallback = useCallback(
    async (
      nextPreset: FahamSourcePreset,
      nextDirectionMode: FahamMcqDirectionMode,
      nextIsRevision: boolean,
    ) => {
      try {
        return {
          snapshot: await requestQueue(
            nextPreset,
            nextDirectionMode,
            nextIsRevision,
          ),
          source: "remote" as const,
        };
      } catch (error) {
        const offline = await buildOfflineFahamQueueSnapshot({
          directionMode: nextDirectionMode,
          isRevision: nextIsRevision,
          levelProgressHint: levelProgressRef.current,
          preset: nextPreset,
        });
        if (offline && countQueueCards(offline) > 0)
          return { snapshot: offline, source: "tier-package" as const };
        throw error;
      }
    },
    [levelProgressRef],
  );

  const restoreCachedQueue = useCallback(
    (
      message: string | null,
      options: {
        clearSessionSummary?: boolean;
        expectedConfig?: {
          directionMode: FahamMcqDirectionMode;
          isRevision: boolean;
          preset: FahamSourcePreset;
        };
        resetSessionTracking?: boolean;
      } = {},
    ) => {
      const cached = loadMatchingCachedQueue(options.expectedConfig);
      if (!cached) return false;
      state.setPreset(cached.preset);
      state.setDirectionMode(cached.directionMode);
      state.setIsRevision(cached.isRevision);
      state.setSnapshot(cached.snapshot);
      state.setCurrentIndex(0);
      state.setAnswerState(null);
      state.setShowPreview(true);
      if (options.clearSessionSummary) state.setSessionSummary(null);
      if (options.resetSessionTracking) resetSessionTracking();
      const cachedStats = loadCachedFahamStats();
      if (cachedStats) stats.applyStats(cachedStats.stats, false);
      state.setErrorMessage(message);
      return true;
    },
    [resetSessionTracking, stats.applyStats],
  );

  const reloadQueue = (
    nextPreset: FahamSourcePreset,
    nextDirectionMode: FahamMcqDirectionMode,
    nextIsRevision = false,
  ) => {
    state.startTransition(() => {
      void requestQueueWithFallback(
        nextPreset,
        nextDirectionMode,
        nextIsRevision,
      )
        .then(({ snapshot, source }) => {
          saveRestorableCachedQueue({
            directionMode: nextDirectionMode,
            isRevision: nextIsRevision,
            preset: nextPreset,
            snapshot,
          });
          state.setPreset(nextPreset);
          state.setDirectionMode(nextDirectionMode);
          state.setIsRevision(nextIsRevision);
          state.setSnapshot(snapshot);
          state.setCurrentIndex(0);
          state.setAnswerState(null);
          state.setErrorMessage(
            source === "tier-package"
              ? "Sesi tempatan: Faham dibuka daripada pakej perkataan yang telah dimuat turun."
              : null,
          );
          state.setSessionSummary(null);
          state.setShowPreview(true);
          resetSessionTracking();
          void stats.prefetchTierVocabForWordLimit(
            snapshot.levelProgress.activeWordLimit,
          );
        })
        .catch(() => {
          if (
            !restoreCachedQueue(
              "Sesi tersimpan dibuka supaya anda boleh teruskan tanpa tunggu sambungan pulih.",
              { clearSessionSummary: true, resetSessionTracking: true },
            )
          )
            state.setErrorMessage("Barisan Faham tak dapat dimuat sekarang.");
        })
        .finally(() => state.setIsHydratingInitialQueue(false));
    });
  };

  useEffect(() => {
    if (
      !initial.shouldHydrateInitialQueue ||
      state.isHydratingInitialQueue ||
      !isRestorableFahamQueue(state.snapshot)
    ) {
      return;
    }
    saveRestorableCachedQueue({
      directionMode: state.directionMode,
      isRevision: state.isRevision,
      preset: state.preset,
      snapshot: state.snapshot,
    });
  }, [
    initial.shouldHydrateInitialQueue,
    state.directionMode,
    state.isHydratingInitialQueue,
    state.isRevision,
    state.preset,
    state.snapshot,
  ]);

  useEffect(() => {
    if (!initial.shouldHydrateInitialQueue) return;
    let cancelled = false;
    const bootstrap = async () => {
      const config = {
        directionMode: "arab_to_bm" as const,
        isRevision: false,
        preset: initial.initialPreset,
      };
      const restored = restoreCachedQueue(null, {
        clearSessionSummary: true,
        expectedConfig: config,
        resetSessionTracking: true,
      });
      if (restored && !cancelled) state.setIsHydratingInitialQueue(false);
      if (!restored) {
        const cachedStats = loadCachedFahamStats();
        if (cachedStats) stats.applyStats(cachedStats.stats, false);
        const offline = await buildOfflineFahamQueueSnapshot({
          directionMode: config.directionMode,
          isRevision: config.isRevision,
          levelProgressHint:
            cachedStats?.stats.levelProgress ??
            initial.initialStats?.levelProgress ??
            initial.initialQueue.levelProgress,
          preset: config.preset,
        });
        if (!cancelled && offline && countQueueCards(offline) > 0) {
          state.setPreset(config.preset);
          state.setDirectionMode(config.directionMode);
          state.setIsRevision(config.isRevision);
          state.setSnapshot(offline);
          state.setCurrentIndex(0);
          state.setAnswerState(null);
          state.setErrorMessage(null);
          state.setSessionSummary(null);
          state.setShowPreview(true);
          resetSessionTracking();
          state.setIsHydratingInitialQueue(false);
          void stats.prefetchTierVocabForWordLimit(
            offline.levelProgress.activeWordLimit,
          );
        }
      }
      state.startTransition(() => {
        void requestQueueWithFallback(
          initial.initialPreset,
          "arab_to_bm",
          false,
        )
          .then(({ snapshot, source }) => {
            if (cancelled) return;
            saveRestorableCachedQueue({
              directionMode: "arab_to_bm",
              isRevision: false,
              preset: initial.initialPreset,
              snapshot,
            });
            state.setPreset(initial.initialPreset);
            state.setDirectionMode("arab_to_bm");
            state.setIsRevision(false);
            state.setSnapshot(snapshot);
            state.setCurrentIndex(0);
            state.setAnswerState(null);
            state.setErrorMessage(
              source === "tier-package"
                ? "Sesi tempatan: Faham dibuka daripada pakej perkataan yang telah dimuat turun."
                : null,
            );
            state.setSessionSummary(null);
            state.setShowPreview(true);
            resetSessionTracking();
            void stats.prefetchTierVocabForWordLimit(
              snapshot.levelProgress.activeWordLimit,
            );
          })
          .catch(() => {
            if (cancelled) return;
            if (
              !restoreCachedQueue(
                "Sesi tersimpan dibuka supaya anda boleh teruskan tanpa tunggu sambungan pulih.",
                { clearSessionSummary: true, resetSessionTracking: true },
              )
            )
              state.setErrorMessage("Barisan Faham tak dapat dimuat sekarang.");
          })
          .finally(() => {
            if (!cancelled) state.setIsHydratingInitialQueue(false);
          });
      });
    };
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [
    initial.initialPreset,
    initial.initialQueue.levelProgress,
    initial.initialStats?.levelProgress,
    initial.shouldHydrateInitialQueue,
    requestQueueWithFallback,
    resetSessionTracking,
    restoreCachedQueue,
    stats.applyStats,
    stats.prefetchTierVocabForWordLimit,
  ]);

  return {
    reloadQueue,
    requestQueueWithFallback,
    resetSessionTracking,
    restoreCachedQueue,
  };
}

export type FahamQueueController = ReturnType<typeof useFahamQueueController>;
