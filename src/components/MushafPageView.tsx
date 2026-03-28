"use client";

import {
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type TouchEvent,
} from "react";
import {
  getDifficultAyahs,
  toggleDifficultAyah,
} from "@/lib/hifz/difficultAyahs";
import {
  calculateHifzRevealStageByAyahKeys,
  type HifzRevealStage,
} from "@/lib/hifz/pageReveal";
import { useReadMode } from "@/lib/useReadMode";
import { getAyahKeyFromLocation } from "@/lib/mushafGlyphs";
import type { MushafLayoutPage } from "@/types/mushafLayout";
import type { MushafWordTranslationMap } from "@/types/mushaf";
import { MushafLivePage, type MushafLiveWordRef } from "@/components/MushafLivePage";

export interface MushafAyahDetail {
  id: number;
  key: string;
  label: string;
  textUthmani: string;
  bm: string | null;
  en: string | null;
}

interface MushafPageViewProps {
  pageNumber: number;
  layout: MushafLayoutPage;
  wordTranslations: MushafWordTranslationMap;
  ayahDetails: MushafAyahDetail[];
  memorizedAyahKeys: string[];
  hifzRevealByThirdsEnabled?: boolean;
  onNavigatePrevPage?: () => void;
  onNavigateNextPage?: () => void;
  onCanvasTap?: () => void;
  onAyahAudioTap?: (ayahKey: string) => void;
  audioDiscovered?: boolean;
  onAudioDiscovered?: () => void;
  onReadyChange?: (ready: boolean) => void;
  activePlaybackAyahKey?: string | null;
  isAudioDockVisible?: boolean;
  onPlayableAyahKeysChange?: (ayahKeys: string[] | null) => void;
}

function revealStageLabel(stage: HifzRevealStage): string {
  if (stage === 1) return "1/3";
  if (stage === 2) return "2/3";
  return "Penuh";
}

function trackHifzUiEvent(
  eventName: "hafal_click" | "hafal_success" | "hafal_fail",
  payload: Record<string, unknown>,
): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("miftah:hifz-ui", {
      detail: { eventName, ...payload },
    }),
  );
  const maybeGtag = Reflect.get(window, "gtag");
  if (typeof maybeGtag === "function") {
    maybeGtag("event", eventName, payload);
  }
}

export function MushafPageView({
  pageNumber,
  layout,
  wordTranslations,
  ayahDetails,
  memorizedAyahKeys,
  hifzRevealByThirdsEnabled = false,
  onNavigatePrevPage,
  onNavigateNextPage,
  onCanvasTap,
  onAyahAudioTap,
  audioDiscovered = true,
  onAudioDiscovered,
  onReadyChange,
  activePlaybackAyahKey = null,
  isAudioDockVisible = false,
  onPlayableAyahKeysChange,
}: MushafPageViewProps) {
  const [selectedWordLocation, setSelectedWordLocation] = useState<string | null>(null);
  const [selectedWordElement, setSelectedWordElement] = useState<HTMLElement | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [showDiscoveryHint, setShowDiscoveryHint] = useState(!audioDiscovered);
  const [markingMemorized, setMarkingMemorized] = useState(false);
  const [markMemorizedError, setMarkMemorizedError] = useState<string | null>(null);
  const [hifzFeedbackMessage, setHifzFeedbackMessage] = useState<string | null>(null);
  const [memorizedAyahKeySet, setMemorizedAyahKeySet] = useState(
    () => new Set(memorizedAyahKeys),
  );
  const [difficultAyahSet, setDifficultAyahSet] = useState<Set<string>>(
    () => getDifficultAyahs(),
  );
  const [difficultToast, setDifficultToast] = useState<string | null>(null);
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const swipeSuppressTapRef = useRef(false);
  const swipeNavigateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [swipeOffsetPx, setSwipeOffsetPx] = useState(0);
  const [swipeIsDragging, setSwipeIsDragging] = useState(false);
  const [swipePreviewPage, setSwipePreviewPage] = useState<number | null>(null);
  const [swipeViewportWidth, setSwipeViewportWidth] = useState(0);

  const { mode } = useReadMode();
  const modeAllowsWordInteraction = mode === "faham";

  // Derive ayah keys from layout
  const pageAyahKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const line of layout.lines) {
      if (line.type !== "text" || !line.words) continue;
      for (const word of line.words) {
        const ak = getAyahKeyFromLocation(word.location);
        if (ak) keys.add(ak);
      }
    }
    return Array.from(keys);
  }, [layout]);

  const ayahDetailsMap = useMemo(() => {
    const map = new Map<string, MushafAyahDetail>();
    for (const ayah of ayahDetails) {
      map.set(ayah.key, ayah);
    }
    return map;
  }, [ayahDetails]);

  const allAyatMemorized = useMemo(
    () =>
      pageAyahKeys.length > 0 &&
      pageAyahKeys.every((key) => memorizedAyahKeySet.has(key)),
    [pageAyahKeys, memorizedAyahKeySet],
  );

  const remainingAyahKeys = useMemo(
    () => pageAyahKeys.filter((key) => !memorizedAyahKeySet.has(key)),
    [pageAyahKeys, memorizedAyahKeySet],
  );

  const memorizedOnPageCount = useMemo(
    () => pageAyahKeys.filter((key) => memorizedAyahKeySet.has(key)).length,
    [pageAyahKeys, memorizedAyahKeySet],
  );

  // Hifz reveal by thirds — line-index based
  const totalLineCount = useMemo(() => {
    return layout.lines.filter((l) => l.type === "text").length || 15;
  }, [layout]);

  // Map ayah keys to approximate line positions (1-indexed)
  const ayahLinePositions = useMemo(() => {
    const positions: Array<{ key: string; linePosition: number }> = [];
    let textLineIndex = 0;
    for (const line of layout.lines) {
      if (line.type !== "text") continue;
      textLineIndex++;
      if (!line.words) continue;
      for (const word of line.words) {
        const ak = getAyahKeyFromLocation(word.location);
        if (ak && !positions.some((p) => p.key === ak)) {
          positions.push({ key: ak, linePosition: textLineIndex });
        }
      }
    }
    return positions;
  }, [layout]);

  // Compute hifz reveal context
  const hifzRevealContext = useMemo(() => {
    if (mode !== "hifz" || !hifzRevealByThirdsEnabled || pageAyahKeys.length === 0) {
      return null;
    }

    // Divide lines into thirds by ayah boundaries
    const thirdSize = totalLineCount / 3;
    const firstBoundaryLine = Math.ceil(thirdSize);
    const secondBoundaryLine = Math.ceil(thirdSize * 2);

    const firstSegmentAyahKeys = ayahLinePositions
      .filter((p) => p.linePosition <= firstBoundaryLine)
      .map((p) => p.key);
    const secondSegmentAyahKeys = ayahLinePositions
      .filter((p) => p.linePosition > firstBoundaryLine && p.linePosition <= secondBoundaryLine)
      .map((p) => p.key);
    const thirdSegmentAyahKeys = ayahLinePositions
      .filter((p) => p.linePosition > secondBoundaryLine)
      .map((p) => p.key);

    const stage = calculateHifzRevealStageByAyahKeys(
      firstSegmentAyahKeys,
      secondSegmentAyahKeys,
      memorizedAyahKeySet,
    );

    // Convert stage to a line boundary index in the full layout (including non-text lines)
    const targetTextLine = stage === 1 ? firstBoundaryLine : stage === 2 ? secondBoundaryLine : totalLineCount;
    let textCounter = 0;
    let boundaryLayoutIndex: number | null = null;
    for (let i = 0; i < layout.lines.length; i++) {
      if (layout.lines[i].type === "text") {
        textCounter++;
        if (textCounter >= targetTextLine) {
          boundaryLayoutIndex = i + 1; // hide from next line onward
          break;
        }
      }
    }

    return {
      stage,
      firstBoundaryLine,
      secondBoundaryLine,
      boundaryLayoutIndex,
      firstSegmentAyahKeys,
      secondSegmentAyahKeys,
      thirdSegmentAyahKeys,
    };
  }, [
    ayahLinePositions,
    hifzRevealByThirdsEnabled,
    layout.lines,
    memorizedAyahKeySet,
    mode,
    pageAyahKeys.length,
    totalLineCount,
  ]);

  const hifzRevealSessionActive = mode === "hifz" && hifzRevealContext !== null;
  const revealBoundaryLineIndex =
    hifzRevealContext && hifzRevealContext.stage < 3
      ? hifzRevealContext.boundaryLayoutIndex
      : null;

  const hifzStageTargetAyahKeys = useMemo(() => {
    if (mode !== "hifz") return [];
    if (!hifzRevealContext) return remainingAyahKeys;
    if (hifzRevealContext.stage === 1) return hifzRevealContext.firstSegmentAyahKeys;
    if (hifzRevealContext.stage === 2) return hifzRevealContext.secondSegmentAyahKeys;
    return hifzRevealContext.thirdSegmentAyahKeys;
  }, [hifzRevealContext, mode, remainingAyahKeys]);

  const hifzPlayableAyahKeys = useMemo(() => {
    if (mode !== "hifz" || !hifzRevealByThirdsEnabled || !hifzRevealContext) return null;
    if (hifzRevealContext.stage === 1) {
      return hifzRevealContext.firstSegmentAyahKeys.length > 0
        ? hifzRevealContext.firstSegmentAyahKeys
        : null;
    }
    if (hifzRevealContext.stage === 2) {
      const keys = [
        ...hifzRevealContext.firstSegmentAyahKeys,
        ...hifzRevealContext.secondSegmentAyahKeys,
      ];
      return keys.length > 0 ? Array.from(new Set(keys)) : null;
    }
    return pageAyahKeys.length > 0 ? pageAyahKeys : null;
  }, [hifzRevealByThirdsEnabled, hifzRevealContext, mode, pageAyahKeys]);

  const canMarkHifz = mode === "hifz" && remainingAyahKeys.length > 0;
  const showHifzSessionControls =
    mode === "hifz" && isReady && hifzRevealByThirdsEnabled;
  const hifzTargetStage = hifzRevealSessionActive ? hifzRevealContext.stage : 3;
  const hifzCompletedStageCount = allAyatMemorized
    ? 3
    : hifzRevealSessionActive
      ? Math.max(hifzTargetStage - 1, 0)
      : 0;
  const hifzActiveStage = allAyatMemorized
    ? null
    : hifzRevealSessionActive
      ? Math.min(hifzTargetStage, 3)
      : null;
  const hifzStages = [
    { label: "1/3", step: 1 },
    { label: "2/3", step: 2 },
    { label: "Penuh", step: 3 },
  ] as const;
  const hifzActionHint = hifzRevealSessionActive
    ? "Tekan sekali untuk buka bahagian seterusnya."
    : "Semua ayat pada halaman ini akan ditanda sebagai hafal.";
  const hifzProgressHint =
    pageAyahKeys.length > 0
      ? `${memorizedOnPageCount}/${pageAyahKeys.length} ayat sudah ditanda hafal`
      : "Tiada ayat ditemui pada halaman ini";
  const hifzHafalButtonLabel = allAyatMemorized
    ? "Halaman Sudah Hafal"
    : markingMemorized
      ? "Menyimpan..."
      : !canMarkHifz
        ? "Tiada Ayat Untuk Ditanda"
        : !hifzRevealSessionActive
          ? "Sahkan Hafal Halaman"
          : hifzRevealContext?.stage === 1
            ? "Sahkan Hafal 1/3 Pertama"
            : hifzRevealContext?.stage === 2
              ? "Sahkan Hafal 1/3 Kedua"
              : "Sahkan Hafal Baki Halaman";

  // Effects
  useEffect(() => {
    setShowDiscoveryHint(!audioDiscovered);
  }, [audioDiscovered]);

  useEffect(() => {
    if (!showDiscoveryHint || mode !== "read") return;
    const timer = window.setTimeout(() => setShowDiscoveryHint(false), 2600);
    return () => window.clearTimeout(timer);
  }, [mode, showDiscoveryHint]);

  useEffect(() => {
    if (!hifzFeedbackMessage) return;
    const timer = window.setTimeout(() => setHifzFeedbackMessage(null), 2600);
    return () => window.clearTimeout(timer);
  }, [hifzFeedbackMessage]);

  useEffect(() => {
    onPlayableAyahKeysChange?.(hifzPlayableAyahKeys);
  }, [hifzPlayableAyahKeys, onPlayableAyahKeysChange]);

  useEffect(() => {
    onReadyChange?.(isReady);
  }, [isReady, onReadyChange]);

  useEffect(() => {
    return () => {
      onPlayableAyahKeysChange?.(null);
    };
  }, [onPlayableAyahKeysChange]);

  useEffect(() => {
    return () => {
      if (swipeNavigateTimerRef.current !== null) {
        clearTimeout(swipeNavigateTimerRef.current);
      }
    };
  }, []);

  // Word interaction handlers
  const handleWordClick = useCallback(
    (wordRef: MushafLiveWordRef, element: HTMLElement) => {
      onAudioDiscovered?.();
      setShowDiscoveryHint(false);

      if (modeAllowsWordInteraction) {
        setSelectedWordLocation(wordRef.location);
        setSelectedWordElement(element);
      } else if ((mode === "read" || mode === "hifz") && wordRef.ayahKey) {
        onAyahAudioTap?.(wordRef.ayahKey);
      }
    },
    [mode, modeAllowsWordInteraction, onAudioDiscovered, onAyahAudioTap],
  );

  const handleWordLongPress = useCallback(
    (wordRef: MushafLiveWordRef) => {
      if (!wordRef.ayahKey) return;
      const nowDifficult = toggleDifficultAyah(wordRef.ayahKey);
      setDifficultAyahSet(getDifficultAyahs());
      setDifficultToast(
        nowDifficult
          ? `${wordRef.ayahKey} ditanda susah`
          : `${wordRef.ayahKey} tanda dibuang`,
      );
      setTimeout(() => setDifficultToast(null), 2000);
    },
    [],
  );

  const handleMarkHifzMemorized = async () => {
    if (mode !== "hifz" || markingMemorized || allAyatMemorized || !canMarkHifz) return;

    const fallbackKeys = remainingAyahKeys;
    const targetAyahKeys =
      hifzStageTargetAyahKeys.length > 0 ? hifzStageTargetAyahKeys : fallbackKeys;
    if (targetAyahKeys.length === 0) {
      setMarkMemorizedError("Ayat sasaran tidak dijumpai untuk ditanda hafal.");
      return;
    }
    const targetAyahIds = targetAyahKeys
      .map((key) => ayahDetailsMap.get(key)?.id ?? null)
      .filter((v): v is number => typeof v === "number");
    if (targetAyahIds.length === 0) {
      setMarkMemorizedError("Ayat sasaran tidak dijumpai untuk ditanda hafal.");
      return;
    }

    const completedStageLabel = !hifzRevealSessionActive
      ? "Halaman selesai ditanda hafal."
      : hifzRevealContext?.stage === 1
        ? "1/3 pertama selesai."
        : hifzRevealContext?.stage === 2
          ? "2/3 selesai."
          : "Baki halaman selesai.";

    setMarkingMemorized(true);
    setMarkMemorizedError(null);
    setHifzFeedbackMessage(null);
    trackHifzUiEvent("hafal_click", {
      pageNumber,
      stage: hifzRevealContext?.stage ?? null,
      targetCount: targetAyahIds.length,
    });

    try {
      const response = await fetch("/api/hifz/mark-memorized", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ayahIds: targetAyahIds }),
      });
      if (!response.ok) {
        setMarkMemorizedError("Gagal simpan status hafal. Cuba lagi.");
        trackHifzUiEvent("hafal_fail", {
          pageNumber,
          stage: hifzRevealContext?.stage ?? null,
          reason: "response_not_ok",
        });
        return;
      }
      setMemorizedAyahKeySet((current) => {
        const next = new Set(current);
        for (const key of targetAyahKeys) next.add(key);
        return next;
      });
      setHifzFeedbackMessage(completedStageLabel);
      trackHifzUiEvent("hafal_success", {
        pageNumber,
        stage: hifzRevealContext?.stage ?? null,
        targetCount: targetAyahIds.length,
      });
    } catch {
      setMarkMemorizedError("Gagal simpan status hafal. Cuba lagi.");
      trackHifzUiEvent("hafal_fail", {
        pageNumber,
        stage: hifzRevealContext?.stage ?? null,
        reason: "network_or_exception",
      });
    } finally {
      setMarkingMemorized(false);
    }
  };

  // Swipe navigation
  const resetSwipeState = useCallback(() => {
    setSwipeOffsetPx(0);
    setSwipeIsDragging(false);
    setSwipePreviewPage(null);
    swipeSuppressTapRef.current = false;
  }, []);

  const handleTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    if (!touch) return;
    setSwipeViewportWidth(containerRef.current?.clientWidth ?? 0);
    touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
  };

  const handleTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    const start = touchStartRef.current;
    if (!start) return;
    const touch = event.touches[0];
    if (!touch) return;

    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    // Lock to horizontal swipes; keep vertical scroll behavior when mostly vertical.
    if (!swipeIsDragging) {
      if (absDx < 12 || absDx < absDy * 1.1) {
        return;
      }
      setSwipeIsDragging(true);
    }

    if (absDx > 10) {
      swipeSuppressTapRef.current = true;
    }

    event.preventDefault();

    const width = Math.max(1, containerRef.current?.clientWidth ?? swipeViewportWidth);
    const maxShift = width * 0.95;
    let clampedDx = Math.max(-maxShift, Math.min(maxShift, dx));

    const hasNextPage = pageNumber < 604;
    const hasPrevPage = pageNumber > 1;
    if (clampedDx > 0 && !hasNextPage) {
      clampedDx = Math.min(clampedDx, 28);
    }
    if (clampedDx < 0 && !hasPrevPage) {
      clampedDx = Math.max(clampedDx, -28);
    }

    setSwipeOffsetPx(clampedDx);
    if (clampedDx > 0) {
      setSwipePreviewPage(hasNextPage ? pageNumber + 1 : null);
      return;
    }
    if (clampedDx < 0) {
      setSwipePreviewPage(hasPrevPage ? pageNumber - 1 : null);
      return;
    }
    setSwipePreviewPage(null);
  };

  const handleTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start) return;
    const touch = event.changedTouches[0];
    if (!touch) return;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    const elapsedMs = Date.now() - start.time;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    const width = Math.max(1, containerRef.current?.clientWidth ?? swipeViewportWidth);
    const absOffset = Math.abs(swipeOffsetPx);
    const shouldNavigate =
      elapsedMs <= 900 &&
      absDy <= 120 &&
      absDx >= absDy * 1.1 &&
      (absOffset > width * 0.26 || (elapsedMs < 300 && absOffset > 48));

    setSwipeIsDragging(false);

    if (!shouldNavigate || swipePreviewPage === null) {
      setSwipeOffsetPx(0);
      setSwipePreviewPage(null);
      return;
    }

    const exitOffset = swipeOffsetPx > 0 ? width : -width;
    setSwipeOffsetPx(exitOffset);

    if (swipeNavigateTimerRef.current !== null) {
      clearTimeout(swipeNavigateTimerRef.current);
    }
    swipeNavigateTimerRef.current = setTimeout(() => {
      // RTL mushaf: swipe right = next page (advance reading), swipe left = prev page.
      if (swipeOffsetPx > 0) {
        onNavigateNextPage?.();
      } else {
        onNavigatePrevPage?.();
      }
      swipeNavigateTimerRef.current = null;
      resetSwipeState();
    }, 140);
  };

  const handleTouchCancel = () => {
    touchStartRef.current = null;
    resetSwipeState();
  };

  const swipeCurrentStyle: CSSProperties = {
    transform: `translate3d(${swipeOffsetPx}px, 0, 0)`,
    transition: swipeIsDragging ? "none" : "transform 180ms cubic-bezier(0.22, 0.61, 0.36, 1)",
    willChange: "transform",
  };

  const hasSwipePreview = swipePreviewPage !== null && Math.abs(swipeOffsetPx) > 0;
  const previewWidth = Math.max(1, swipeViewportWidth || containerRef.current?.clientWidth || 1);
  const previewBase = swipeOffsetPx > 0 ? -previewWidth : previewWidth;
  const swipePreviewStyle: CSSProperties = {
    transform: `translate3d(${previewBase + swipeOffsetPx}px, 0, 0)`,
    transition: swipeIsDragging ? "none" : "transform 180ms cubic-bezier(0.22, 0.61, 0.36, 1)",
    willChange: "transform",
  };

  const handleCanvasClick = () => {
    if (swipeSuppressTapRef.current) {
      swipeSuppressTapRef.current = false;
      return;
    }
    onAudioDiscovered?.();
    setShowDiscoveryHint(false);
    setSelectedWordLocation(null);
    setSelectedWordElement(null);
    setMarkMemorizedError(null);
    onCanvasTap?.();
  };

  // Tooltip positioning
  const tooltipPlacement = useMemo(() => {
    if (!selectedWordElement || !selectedWordLocation || !containerRef.current) return null;
    const containerRect = containerRef.current.getBoundingClientRect();
    const wordRect = selectedWordElement.getBoundingClientRect();

    const relativeX = wordRect.left - containerRect.left + wordRect.width / 2;
    const relativeY = wordRect.top - containerRect.top;
    const containerWidth = containerRect.width;
    const containerHeight = containerRect.height;

    const tooltipWidth = Math.min(320, containerWidth * 0.7);
    const tooltipGap = 8;
    const estimatedHeight = 80;

    let left = relativeX - tooltipWidth / 2;
    left = Math.max(8, Math.min(left, containerWidth - tooltipWidth - 8));

    const isBottomHalf = relativeY > containerHeight * 0.55;
    const top = isBottomHalf
      ? relativeY - estimatedHeight - tooltipGap
      : wordRect.bottom - containerRect.top + tooltipGap;

    return { left, top: Math.max(8, top), width: tooltipWidth };
  }, [selectedWordElement, selectedWordLocation]);

  const selectedTranslation = selectedWordLocation
    ? wordTranslations[selectedWordLocation] ?? null
    : null;

  return (
    <section
      className={`space-y-3 ${
        showHifzSessionControls
          ? isAudioDockVisible
            ? "pb-64 sm:pb-0"
            : "pb-40 sm:pb-0"
          : ""
      }`}
    >
      {/* Discovery Hint */}
      {showDiscoveryHint && mode === "read" && isReady && (
        <div className="flex justify-center">
          <div className="flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 shadow-sm animate-in fade-in duration-300 sm:px-4 sm:py-2 sm:text-base dark:bg-emerald-900/30 dark:text-emerald-100">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
            </svg>
            Tip: Klik halaman atau buka Audio untuk dengar bacaan
          </div>
        </div>
      )}

      {/* Hifz session controls */}
      {showHifzSessionControls ? (
        <>
          {/* Desktop */}
          <div className="sticky top-2 z-40 hidden sm:block">
            <div className="rounded-2xl border border-teal-200 bg-white/96 p-4 shadow-[0_16px_36px_rgba(13,148,136,0.16)] backdrop-blur dark:border-teal-900/60 dark:bg-stone-900/95">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  {hifzStages.map((stage) => {
                    const isDone = stage.step <= hifzCompletedStageCount;
                    const isActive = stage.step === hifzActiveStage;
                    return (
                      <span
                        key={stage.step}
                        className={`inline-flex min-h-10 items-center rounded-full border px-4 text-sm font-semibold transition ${
                          isDone
                            ? "border-teal-600 bg-teal-600 text-white dark:border-teal-400 dark:bg-teal-500 dark:text-stone-950"
                            : isActive
                              ? "border-teal-500 bg-teal-50 text-teal-900 dark:border-teal-400 dark:bg-teal-900/45 dark:text-teal-100"
                              : "border-stone-300 bg-stone-100 text-stone-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300"
                        }`}
                      >
                        {stage.label}
                      </span>
                    );
                  })}
                </div>
                <button
                  type="button"
                  disabled={allAyatMemorized || markingMemorized || !canMarkHifz}
                  onClick={handleMarkHifzMemorized}
                  className="inline-flex min-h-11 items-center justify-center rounded-full bg-teal-900 px-6 text-[15px] font-semibold text-teal-50 transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-55 dark:bg-teal-600 dark:hover:bg-teal-500"
                >
                  {hifzHafalButtonLabel}
                </button>
              </div>
              <p className="mt-3 text-sm text-teal-800 dark:text-teal-200">
                {hifzActionHint} {hifzProgressHint}
              </p>
              {hifzFeedbackMessage ? (
                <p className="mt-1 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                  {hifzFeedbackMessage}
                </p>
              ) : null}
              {markMemorizedError ? (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                  {markMemorizedError}
                </p>
              ) : null}
            </div>
          </div>

          {/* Mobile */}
          <div
            className={`fixed inset-x-0 z-50 px-3 pb-[calc(env(safe-area-inset-bottom)+10px)] sm:hidden ${
              isAudioDockVisible ? "bottom-[104px]" : "bottom-0"
            }`}
          >
            <div className="rounded-2xl border border-teal-200 bg-white/96 p-3 shadow-[0_14px_34px_rgba(13,148,136,0.22)] backdrop-blur dark:border-teal-900/60 dark:bg-stone-900/95">
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                {hifzStages.map((stage) => {
                  const isDone = stage.step <= hifzCompletedStageCount;
                  const isActive = stage.step === hifzActiveStage;
                  return (
                    <span
                      key={`mobile-${stage.step}`}
                      className={`inline-flex min-h-9 shrink-0 items-center rounded-full border px-3 text-xs font-semibold ${
                        isDone
                          ? "border-teal-600 bg-teal-600 text-white dark:border-teal-400 dark:bg-teal-500 dark:text-stone-950"
                          : isActive
                            ? "border-teal-500 bg-teal-50 text-teal-900 dark:border-teal-400 dark:bg-teal-900/45 dark:text-teal-100"
                            : "border-stone-300 bg-stone-100 text-stone-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300"
                      }`}
                    >
                      {stage.label}
                    </span>
                  );
                })}
              </div>
              <button
                type="button"
                disabled={allAyatMemorized || markingMemorized || !canMarkHifz}
                onClick={handleMarkHifzMemorized}
                className="mt-2 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-teal-900 px-4 text-sm font-semibold text-teal-50 transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-55 dark:bg-teal-600 dark:hover:bg-teal-500"
              >
                {hifzHafalButtonLabel}
              </button>
              <p className="mt-2 text-xs text-teal-800 dark:text-teal-200">
                {hifzActionHint}
              </p>
              <p className="text-xs text-stone-600 dark:text-stone-300">
                {hifzProgressHint}
              </p>
              {hifzFeedbackMessage ? (
                <p className="mt-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                  {hifzFeedbackMessage}
                </p>
              ) : null}
              {markMemorizedError ? (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                  {markMemorizedError}
                </p>
              ) : null}
            </div>
          </div>
        </>
      ) : null}

      {/* Mushaf page */}
      <div
        ref={containerRef}
        className="relative w-full overflow-hidden cursor-pointer rounded-2xl dark:rounded-none"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchCancel}
        onClick={handleCanvasClick}
      >
        {hasSwipePreview ? (
          <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-2xl bg-stone-100 dark:rounded-none dark:bg-stone-900" style={swipePreviewStyle}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/mushaf/page/${swipePreviewPage}?variant=mobile`}
              alt=""
              aria-hidden="true"
              className="h-full w-full object-contain"
              draggable={false}
            />
            <div className="absolute inset-0 bg-stone-950/8 dark:bg-stone-950/25" />
            <div className="absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-white/85 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-stone-700 shadow-sm dark:bg-stone-900/80 dark:text-stone-200">
              Halaman {swipePreviewPage}
            </div>
          </div>
        ) : null}

        <div className="relative z-10" style={swipeCurrentStyle}>
          <MushafLivePage
            pageNumber={pageNumber}
            layout={layout}
            onWordClick={handleWordClick}
            onWordLongPress={modeAllowsWordInteraction ? handleWordLongPress : undefined}
            activePlaybackAyahKey={activePlaybackAyahKey}
            highlightedWordLocation={modeAllowsWordInteraction ? selectedWordLocation : null}
            revealBoundaryLineIndex={revealBoundaryLineIndex}
            difficultAyahKeys={modeAllowsWordInteraction ? difficultAyahSet : undefined}
            onReady={useCallback(() => setIsReady(true), [])}
          />

          {/* Word translation tooltip */}
          {modeAllowsWordInteraction && selectedWordLocation && tooltipPlacement ? (
            <article
              data-testid="word-tooltip"
              className="pointer-events-none absolute z-20 rounded-xl border border-stone-300 bg-white/96 px-3 py-2 text-sm text-stone-800 shadow-md dark:border-stone-700 dark:bg-stone-900/96 dark:text-stone-100"
              style={{
                left: tooltipPlacement.left,
                top: tooltipPlacement.top,
                width: tooltipPlacement.width,
              }}
            >
              <p className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                {selectedTranslation?.bm ?? "Tiada terjemahan"}
              </p>
              <p className="text-sm text-stone-600 dark:text-stone-300">
                {selectedTranslation?.en ?? "No translation"}
              </p>
              <p className="mt-1 text-xs text-stone-500 sm:text-sm dark:text-stone-400">
                {selectedWordLocation}
              </p>
            </article>
          ) : null}

          {/* Difficult ayah toast */}
          {difficultToast ? (
            <div className="pointer-events-none absolute left-1/2 top-4 z-30 -translate-x-1/2 rounded-lg bg-stone-900/90 px-3 py-1.5 text-xs font-medium text-white shadow-lg">
              {difficultToast}
            </div>
          ) : null}

          {/* Hifz reveal boundary label */}
          {hifzRevealContext && revealBoundaryLineIndex != null && (
            <div className="pointer-events-none absolute left-1/2 bottom-4 z-30 -translate-x-1/2 rounded-full border border-teal-500/40 bg-white/95 px-3 py-1 text-xs font-semibold tracking-wide text-teal-800 sm:text-sm dark:border-teal-300/40 dark:bg-stone-900/95 dark:text-teal-200">
              HIFZ REVEAL · {revealStageLabel(hifzRevealContext.stage)}
            </div>
          )}
        </div>
      </div>

      {/* Status text */}
      {mode === "read" ? (
        <p className="text-[15px] text-stone-600 sm:text-base dark:text-stone-300">
          Mod Baca: Leret untuk tukar halaman. <strong>Klik ayat untuk mula bacaan dari situ, atau gunakan butang Audio.</strong>
        </p>
      ) : mode === "hifz" && hifzRevealContext && revealBoundaryLineIndex != null ? (
        <p className="text-[15px] text-teal-700 sm:text-base dark:text-teal-300">
          Hifz reveal aktif: paparan {revealStageLabel(hifzRevealContext.stage)} halaman (sempadan ikut hujung ayat).
        </p>
      ) : mode === "hifz" ? (
        <p className="text-[15px] text-teal-700 sm:text-base dark:text-teal-300">
          {"Gunakan butang Hafal untuk membuka 1/3 → 2/3 → penuh. "}
          <strong>Tekan ayat untuk dengar murattal.</strong>
        </p>
      ) : mode === "faham" ? (
        <p className="text-[15px] text-stone-600 sm:text-base dark:text-stone-300">
          Klik perkataan untuk melihat makna segera.
        </p>
      ) : null}
    </section>
  );
}
