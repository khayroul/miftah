"use client";

import type { FahamQueueSnapshot } from "../domain/queue";
import type { FahamSourcePreset } from "../domain/presets";
import { type FahamStats } from "./fahamWorkspaceSupport";
import { useFahamAudioController } from "./useFahamAudioController";
import { useFahamQueueController } from "./useFahamQueueController";
import { useFahamSessionController } from "./useFahamSessionController";
import { useFahamStatsController } from "./useFahamStatsController";
import { useFahamSyncController } from "./useFahamSyncController";
import { useFahamWorkspaceState } from "./useFahamWorkspaceState";

export type { FahamStats } from "./fahamWorkspaceSupport";

export function useFahamWorkspaceSession({
  initialQueue,
  initialPreset = "mixed",
  initialStats = null,
  shouldHydrateInitialQueue = false,
}: {
  initialQueue: FahamQueueSnapshot;
  initialPreset?: FahamSourcePreset;
  initialStats?: FahamStats | null;
  shouldHydrateInitialQueue?: boolean;
}) {
  const state = useFahamWorkspaceState({
    initialPreset,
    initialQueue,
    initialStats,
    shouldHydrateInitialQueue,
  });
  const audio = useFahamAudioController(state);
  const stats = useFahamStatsController(state, audio);
  const sync = useFahamSyncController(state, stats);
  const queue = useFahamQueueController(state, stats, {
    initialPreset,
    initialQueue,
    initialStats,
    shouldHydrateInitialQueue,
  });
  const session = useFahamSessionController(
    state,
    audio,
    stats,
    queue,
    sync,
  );

  return {
    answerState: state.answerState,
    audioEnabled: state.audioEnabled,
    cards: state.cards,
    correctAdvanceMode: state.correctAdvanceMode,
    currentCard: state.currentCard,
    currentIndex: state.currentIndex,
    directionMode: state.directionMode,
    errorMessage: state.errorMessage,
    foundCap: state.levelProgress.activeWordLimit,
    foundCount: state.foundCount,
    handleAnswer: session.handleAnswer,
    handleContinue: session.handleContinue,
    handleCorrectAdvanceModeChange: session.handleCorrectAdvanceModeChange,
    handleManualAudio: audio.handleManualAudio,
    handleToggleAudio: audio.handleToggleAudio,
    hasLiveStats: state.stats !== null,
    isConfigExpanded: state.isConfigExpanded,
    isHydratingInitialQueue: state.isHydratingInitialQueue,
    isPending: state.isPending,
    masteredCount: state.masteredCount,
    preset: state.preset,
    progressPct:
      state.cards.length > 0
        ? ((state.currentIndex + 1) / state.cards.length) * 100
        : 0,
    reloadQueue: queue.reloadQueue,
    sessionSummary: state.sessionSummary,
    setIsConfigExpanded: state.setIsConfigExpanded,
    setSessionSummary: state.setSessionSummary,
    setShowPreview: state.setShowPreview,
    showCelebration: state.showCelebration,
    showPreview: state.showPreview,
    snapshot: state.snapshot,
    syncBadge: state.syncBadge,
  };
}
