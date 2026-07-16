"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import type { FahamMcqDirectionMode } from "../domain/mcq";
import type { FahamSourcePreset } from "../domain/presets";
import type { FahamQueueSnapshot } from "../domain/queue";
import type { FahamSessionSummary } from "./FahamSessionSummaryModal";
import type { FahamCorrectAdvanceMode } from "./fahamWorkspaceConfig";
import type { AnswerState } from "./fahamAnswerFlow";
import { queueItems, type FahamStats } from "./fahamWorkspaceSupport";

export type { AnswerState } from "./fahamAnswerFlow";

export type FahamSyncState = "idle" | "syncing" | "offline" | "error";
export type FahamStatsStatus = "loading" | "ready" | "error" | "unavailable";

export function useFahamWorkspaceState({
  initialQueue,
  initialPreset,
  initialStats,
  shouldHydrateInitialQueue,
}: {
  initialQueue: FahamQueueSnapshot;
  initialPreset: FahamSourcePreset;
  initialStats: FahamStats | null;
  shouldHydrateInitialQueue: boolean;
}) {
  const [isConfigExpanded, setIsConfigExpanded] = useState(false);
  const [preset, setPreset] = useState(initialPreset);
  const [directionMode, setDirectionMode] =
    useState<FahamMcqDirectionMode>("arab_to_bm");
  const [isRevision, setIsRevision] = useState(false);
  const [snapshot, setSnapshot] = useState(initialQueue);
  const [stats, setStats] = useState<FahamStats | null>(initialStats);
  const [statsStatus, setStatsStatus] = useState<FahamStatsStatus>(() =>
    initialStats
      ? "ready"
      : shouldHydrateInitialQueue
        ? "loading"
        : "unavailable",
  );
  const [showCelebration, setShowCelebration] = useState(false);
  const [sessionSummary, setSessionSummary] =
    useState<FahamSessionSummary | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answerState, setAnswerState] = useState<AnswerState | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(() =>
    typeof window === "undefined"
      ? true
      : window.localStorage.getItem("miftah:faham:audio-enabled") !== "0",
  );
  const [correctAdvanceMode, setCorrectAdvanceMode] =
    useState<FahamCorrectAdvanceMode>(() => {
      if (typeof window === "undefined") return "normal";
      const saved = window.localStorage.getItem(
        "miftah:faham:correct-advance-mode",
      );
      return saved === "fast" || saved === "normal" || saved === "pause"
        ? saved
        : "normal";
    });
  const [isPending, startTransition] = useTransition();
  const [isHydratingInitialQueue, setIsHydratingInitialQueue] = useState(
    shouldHydrateInitialQueue,
  );
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [syncState, setSyncState] = useState<FahamSyncState>(() =>
    typeof navigator === "undefined" || navigator.onLine ? "idle" : "offline",
  );

  const activeAudioRef = useRef<HTMLAudioElement | null>(null);
  const lastAutoplayKeyRef = useRef<string | null>(null);
  const prevMasteredRef = useRef<number | null>(initialStats?.mastered ?? null);
  const sessionCorrectCountRef = useRef(0);
  const isSyncingRef = useRef(false);
  const syncPromiseRef = useRef<Promise<boolean> | null>(null);
  const prefetchedTierWordLimitRef = useRef(0);
  const isAdvancingRef = useRef(false);

  const cards = useMemo(() => queueItems(snapshot), [snapshot]);
  const currentCard = cards[currentIndex] ?? null;
  const levelProgress = stats?.levelProgress ?? snapshot.levelProgress;
  const foundCount = stats?.wordBank ?? 0;
  const masteredCount = stats?.mastered ?? 0;
  const syncBadge = useMemo(() => {
    if (pendingSyncCount <= 0) return null;
    const styles = {
      syncing: "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-500/30 dark:bg-sky-900/30 dark:text-sky-200",
      offline: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-900/30 dark:text-amber-200",
      error: "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-900/30 dark:text-rose-200",
      idle: "border-teal-200 bg-teal-50 text-teal-800 dark:border-teal-500/30 dark:bg-teal-900/30 dark:text-teal-200",
    };
    const labels = {
      syncing: `Sync Faham ${pendingSyncCount}`,
      offline: `Luar talian ${pendingSyncCount}`,
      error: `Sync tertangguh ${pendingSyncCount}`,
      idle: `Menunggu sync ${pendingSyncCount}`,
    };
    return { className: styles[syncState], label: labels[syncState] };
  }, [pendingSyncCount, syncState]);

  return {
    activeAudioRef, answerState, audioEnabled, cards, correctAdvanceMode,
    currentCard, currentIndex, directionMode, errorMessage, foundCount,
    isAdvancingRef, isConfigExpanded, isHydratingInitialQueue, isPending,
    isRevision, isSyncingRef, lastAutoplayKeyRef, levelProgress,
    masteredCount, pendingSyncCount, prefetchedTierWordLimitRef, preset,
    prevMasteredRef, sessionCorrectCountRef, sessionSummary,
    setAnswerState, setAudioEnabled, setCorrectAdvanceMode, setCurrentIndex,
    setDirectionMode, setErrorMessage, setIsConfigExpanded,
    setIsHydratingInitialQueue, setIsRevision, setPendingSyncCount, setPreset,
    setSessionSummary, setShowCelebration, setShowPreview, setSnapshot,
    setStats, setStatsStatus, setSyncState, showCelebration, showPreview,
    snapshot, startTransition, stats, statsStatus, syncBadge, syncPromiseRef,
  };
}

export type FahamWorkspaceState = ReturnType<typeof useFahamWorkspaceState>;
