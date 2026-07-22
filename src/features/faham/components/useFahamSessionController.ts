"use client";

/* eslint-disable react-hooks/immutability, react-hooks/exhaustive-deps -- this controller intentionally owns mutations of shared session refs */

import { useCallback, useEffect } from "react";
import { useTranslations } from "next-intl";
import type { FsrsRating } from "@/shared/types/database";
import { enqueuePendingFahamRating } from "../domain/offlineSync";
import {
  CORRECT_ADVANCE_CONFIGS,
  type FahamCorrectAdvanceMode,
} from "./fahamWorkspaceConfig";
import {
  beginFahamRetry,
  fahamRatingForAnswer,
  recordFahamAnswer,
  revealFahamAnswer,
} from "./fahamAnswerFlow";
import { saveRestorableCachedQueue } from "./fahamWorkspaceSupport";
import type { FahamAudioController } from "./useFahamAudioController";
import type { FahamQueueController } from "./useFahamQueueController";
import type { FahamStatsController } from "./useFahamStatsController";
import type { FahamSyncController } from "./useFahamSyncController";
import type { FahamWorkspaceState } from "./useFahamWorkspaceState";

export function useFahamSessionController(
  state: FahamWorkspaceState,
  audio: FahamAudioController,
  stats: FahamStatsController,
  queue: FahamQueueController,
  sync: FahamSyncController,
) {
  const t = useTranslations("faham.workspace");
  const moveToNextCard = useCallback(async () => {
    const nextIndex = state.currentIndex + 1;
    if (nextIndex < state.cards.length) {
      state.setCurrentIndex(nextIndex);
      state.setAnswerState(null);
      state.setErrorMessage(null);
      return;
    }
    audio.stopActiveAudio();
    audio.playFeedbackSound("session_complete");
    state.setSessionSummary({
      correctCount: state.sessionCorrectCountRef.current,
      foundCount: state.foundCount,
      masteredCount: state.masteredCount,
      totalCount: state.cards.length,
    });
    queue.resetSessionTracking();
    await sync.syncPendingRatings();
    const latestStatsPromise = stats.refreshStats(true);
    let restored = false;
    try {
      const result = await queue.requestQueueWithFallback(
        state.preset,
        state.directionMode,
        state.isRevision,
      );
      saveRestorableCachedQueue({
        directionMode: state.directionMode,
        isRevision: state.isRevision,
        preset: state.preset,
        snapshot: result.snapshot,
      });
      state.setSnapshot(result.snapshot);
      state.setCurrentIndex(0);
      state.setAnswerState(null);
      state.setErrorMessage(
        result.source === "tier-package"
          ? t("tierPackageSessionNotice")
          : null,
      );
      state.setShowPreview(true);
    } catch {
      restored = queue.restoreCachedQueue(
        t("restoredAfterErrorNotice"),
      );
      if (!restored) {
        state.setCurrentIndex(0);
        state.setAnswerState(null);
        state.setShowPreview(true);
        state.setErrorMessage(t("queueLoadFailed"));
      }
    }
    const latest = await latestStatsPromise;
    if (latest)
      state.setSessionSummary((previous) =>
        previous
          ? {
              ...previous,
              foundCount: latest.wordBank,
              masteredCount: latest.mastered,
            }
          : previous,
      );
  }, [
    audio.playFeedbackSound,
    audio.stopActiveAudio,
    queue.requestQueueWithFallback,
    queue.resetSessionTracking,
    queue.restoreCachedQueue,
    state.cards.length,
    state.currentIndex,
    state.directionMode,
    state.foundCount,
    state.isRevision,
    state.masteredCount,
    state.preset,
    state.sessionCorrectCountRef,
    state.setAnswerState,
    state.setCurrentIndex,
    state.setErrorMessage,
    state.setSessionSummary,
    state.setShowPreview,
    state.setSnapshot,
    stats.refreshStats,
    sync.syncPendingRatings,
    t,
  ]);

  const handleAnswer = (selectedIndex: number) => {
    const retrying = state.answerState?.phase === "retry";
    if (
      !state.currentCard ||
      (state.answerState && !retrying) ||
      state.isPending
    ) {
      return;
    }
    const isCorrect = selectedIndex === state.currentCard.mcq.correctIndex;
    const result = recordFahamAnswer({
      current: state.answerState,
      isCorrect,
      selectedIndex,
    });
    if (result.shouldIncrementCorrectCount) {
      state.sessionCorrectCountRef.current += 1;
    }
    state.setAnswerState(result.answerState);
    audio.playFeedbackSound(isCorrect ? "correct" : "incorrect");
  };

  const handleRetry = () => {
    const retryState = beginFahamRetry(state.answerState);
    if (!retryState) {
      return;
    }
    state.setAnswerState(retryState);
    if (state.currentCard) {
      audio.playWordAudio({
        autoplayKey: `retry:${state.currentCard.progressId}:2`,
        explicitUrl: state.currentCard.mcq.promptAudioUrl,
        lang: state.currentCard.mcq.promptLang,
        text: state.currentCard.mcq.promptPrimary,
      });
    }
  };

  const handleRevealAnswer = () => {
    const revealedState = revealFahamAnswer(state.answerState);
    if (!revealedState) {
      return;
    }
    state.setAnswerState(revealedState);
  };

  const handleCorrectAdvanceModeChange = (mode: FahamCorrectAdvanceMode) => {
    state.setCorrectAdvanceMode(mode);
    window.localStorage.setItem("miftah:faham:correct-advance-mode", mode);
  };

  const handleContinue = useCallback(() => {
    if (!state.currentCard || !state.answerState) return;
    if (state.isAdvancingRef.current) return;
    state.isAdvancingRef.current = true;
    const rating: Extract<FsrsRating, 1 | 3> =
      fahamRatingForAnswer(state.answerState);
    if (state.currentCard.progressId > 0 || state.currentCard.word.id > 0) {
      const pending = enqueuePendingFahamRating({
        progressId:
          state.currentCard.progressId > 0
            ? state.currentCard.progressId
            : undefined,
        rating,
        wordId:
          state.currentCard.word.id > 0
            ? state.currentCard.word.id
            : undefined,
      });
      state.setPendingSyncCount(pending.length);
      state.setSyncState(
        typeof navigator !== "undefined" && !navigator.onLine
          ? "offline"
          : "idle",
      );
    }
    state.startTransition(() => {
      const isTerminalCard = state.currentIndex + 1 >= state.cards.length;
      if (isTerminalCard) {
        void moveToNextCard();
        return;
      }
      void moveToNextCard().then(() => void sync.syncPendingRatings());
    });
  }, [
    moveToNextCard,
    state.answerState,
    state.cards.length,
    state.currentIndex,
    state.currentCard,
    state.isAdvancingRef,
    state.setPendingSyncCount,
    state.setSyncState,
    state.startTransition,
    sync.syncPendingRatings,
  ]);

  useEffect(() => {
    if (!state.answerState || state.answerState.phase === "retry") {
      state.isAdvancingRef.current = false;
    }
  }, [state.answerState, state.isAdvancingRef]);

  useEffect(() => {
    if (
      state.currentCard &&
      !state.answerState &&
      !state.sessionSummary
    )
      audio.playWordAudio({
        autoplayKey: `prompt:${state.currentCard.progressId}`,
        explicitUrl: state.currentCard.mcq.promptAudioUrl,
        lang: state.currentCard.mcq.promptLang,
        text: state.currentCard.mcq.promptPrimary,
      });
  }, [audio.playWordAudio, state.answerState, state.currentCard, state.sessionSummary]);

  useEffect(() => {
    if (
      !state.currentCard ||
      !state.answerState ||
      state.answerState.phase !== "feedback" ||
      !state.answerState.revealAnswer
    ) {
      return;
    }
    const lang =
      state.currentCard.mcq.direction === "bm_to_arab" ? "ar" : "ms";
    audio.playWordAudio({
      autoplayKey: `answer:${state.currentCard.progressId}`,
      explicitUrl: state.currentCard.mcq.answerAudioUrl,
      lang,
      text: state.currentCard.mcq.answerPrimary,
    });
    if (
      !state.answerState.initialIsCorrect ||
      state.answerState.attemptCount !== 1
    ) {
      return;
    }
    const delay = CORRECT_ADVANCE_CONFIGS[state.correctAdvanceMode].delayMs;
    if (delay === null) return;
    const timer = setTimeout(handleContinue, delay);
    return () => clearTimeout(timer);
  }, [
    audio.playWordAudio,
    handleContinue,
    state.answerState,
    state.correctAdvanceMode,
    state.currentCard,
  ]);

  useEffect(() => {
    if (!state.sessionSummary) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") state.setSessionSummary(null);
    };
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [state.sessionSummary, state.setSessionSummary]);

  return {
    handleAnswer,
    handleContinue,
    handleCorrectAdvanceModeChange,
    handleRetry,
    handleRevealAnswer,
  };
}
