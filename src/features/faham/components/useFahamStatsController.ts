"use client";

/* eslint-disable react-hooks/immutability, react-hooks/exhaustive-deps -- this controller intentionally owns the stats and prefetch refs */

import { useCallback, useEffect } from "react";
import { loadPwaConfig } from "@/shared/pwa/downloadConfig";
import { prefetchFahamTierVocabPackage } from "../domain/tierVocabPackage";
import { loadCachedFahamStats, saveCachedFahamStats } from "../domain/offlineSync";
import { requestStats, type FahamStats } from "./fahamWorkspaceSupport";
import type { FahamAudioController } from "./useFahamAudioController";
import type { FahamWorkspaceState } from "./useFahamWorkspaceState";

export function useFahamStatsController(
  state: FahamWorkspaceState,
  audio: FahamAudioController,
  shouldFetchInitialStats: boolean,
) {
  const applyStats = useCallback(
    (newStats: FahamStats, celebrateMastered: boolean) => {
      if (
        celebrateMastered &&
        state.prevMasteredRef.current !== null &&
        newStats.mastered > state.prevMasteredRef.current
      ) {
        state.setShowCelebration(true);
        audio.playFeedbackSound("mastered");
        setTimeout(() => state.setShowCelebration(false), 4000);
      }
      state.prevMasteredRef.current = newStats.mastered;
      state.setStats(newStats);
      state.setStatsStatus("ready");
    },
    [audio.playFeedbackSound, state.prevMasteredRef, state.setShowCelebration, state.setStats],
  );

  const refreshStats = useCallback(
    async (celebrateMastered: boolean) => {
      state.setStatsStatus("loading");
      try {
        const latest = await requestStats();
        applyStats(latest, celebrateMastered);
        saveCachedFahamStats(latest);
        return latest;
      } catch (error) {
        console.error("[faham/stats] Failed to refresh workspace stats", error);
        const cached = loadCachedFahamStats();
        if (cached) {
          applyStats(cached.stats, false);
          return cached.stats;
        }
        state.setStatsStatus("error");
        return null;
      }
    },
    [applyStats],
  );

  const prefetchTierVocabForWordLimit = useCallback(
    async (wordLimit: number) => {
      if (!Number.isInteger(wordLimit) || wordLimit <= 0) return;
      if (state.prefetchedTierWordLimitRef.current >= wordLimit) return;
      try {
        const config = await loadPwaConfig();
        const result = await prefetchFahamTierVocabPackage({
          appBuildId: config.appBuildId ?? "unknown",
          dataVersion: config.fahamDataVersion ?? "1",
          requestedWordLimit: wordLimit,
        });
        if (result.status !== "skipped" && (result.wordLimit ?? 0) >= wordLimit)
          state.prefetchedTierWordLimitRef.current = result.wordLimit ?? wordLimit;
      } catch {
        // Package prefetch is best-effort.
      }
    },
    [state.prefetchedTierWordLimitRef],
  );

  useEffect(() => {
    if (!state.stats) return;
    saveCachedFahamStats(state.stats);
    void prefetchTierVocabForWordLimit(
      state.stats.levelProgress?.activeWordLimit ??
        state.levelProgress.activeWordLimit,
    );
  }, [prefetchTierVocabForWordLimit, state.levelProgress.activeWordLimit, state.stats]);

  useEffect(() => {
    // Establish the mastery baseline once. Subsequent refreshes happen only
    // after a completed session or after recovering an offline backlog.
    if (!shouldFetchInitialStats) return;
    void refreshStats(false);
  }, [refreshStats, shouldFetchInitialStats]);

  return { applyStats, prefetchTierVocabForWordLimit, refreshStats };
}

export type FahamStatsController = ReturnType<typeof useFahamStatsController>;
