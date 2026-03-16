"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { createPortal } from "react-dom";
import type { FahamQueueSnapshot, SerializedFahamCard } from "@/lib/faham/queue";
import type { FahamLevelProgress } from "@/lib/faham/levels";
import type { FahamMcqDirectionMode } from "@/lib/faham/mcq";
import {
  FAHAM_PRESET_CONFIGS,
  type FahamSourcePreset,
} from "@/lib/faham/presets";

interface FahamWorkspaceProps {
  initialQueue: FahamQueueSnapshot;
  initialPreset?: FahamSourcePreset;
  initialStats?: FahamStats | null;
  entryContext?: FahamWorkspaceEntryContext | null;
  setupMessage?: string | null;
  shouldHydrateInitialQueue?: boolean;
}

interface FahamWorkspaceEntryContext {
  badge: string;
  description: string;
  href: string;
  hrefLabel: string;
  title: string;
}

interface AnswerState {
  isCorrect: boolean;
  selectedIndex: number;
}

const DIRECTION_CONFIGS: Record<
  FahamMcqDirectionMode,
  {
    helper: string;
    label: string;
    shortLabel: string;
  }
> = {
  arab_to_bm: {
    helper: "Paparkan perkataan Arab, kemudian cari maksud Melayu yang tepat.",
    label: "Arab -> Melayu",
    shortLabel: "A->M",
  },
  bm_to_arab: {
    helper: "Paparkan makna Melayu, kemudian pilih perkataan Arab yang tepat.",
    label: "Melayu -> Arab",
    shortLabel: "M->A",
  },
  mixed: {
    helper: "Selang-selikan kedua-dua arah supaya recall tidak terlalu bergantung pada satu bentuk soalan.",
    label: "Campur dua arah",
    shortLabel: "Campur",
  },
};

type FahamCorrectAdvanceMode = "fast" | "normal" | "pause";

const CORRECT_ADVANCE_STORAGE_KEY = "miftah:faham:correct-advance-mode";

const CORRECT_ADVANCE_CONFIGS: Record<
  FahamCorrectAdvanceMode,
  {
    delayMs: number | null;
    helper: string;
    label: string;
    shortLabel: string;
  }
> = {
  fast: {
    delayMs: 1000,
    helper: "Kad seterusnya muncul selepas 1 saat. Sesuai jika anda mahu rentak lebih laju.",
    label: "Cepat",
    shortLabel: "1s",
  },
  normal: {
    delayMs: 3000,
    helper: "Kad seterusnya muncul selepas 3 saat. Ini kadar biasa untuk dengar jawapan seketika.",
    label: "Normal",
    shortLabel: "3s",
  },
  pause: {
    delayMs: null,
    helper: "Sesi berhenti selepas jawapan betul sehingga anda tekan kad seterusnya sendiri.",
    label: "Jeda",
    shortLabel: "Jeda",
  },
};

function shuffleSegment(cards: SerializedFahamCard[]): SerializedFahamCard[] {
  if (cards.length <= 1) return cards;
  const today = new Date().toISOString().slice(0, 10);
  return [...cards].sort((a, b) => {
    const ha = hashForShuffle(`${today}:${a.word.id}`);
    const hb = hashForShuffle(`${today}:${b.word.id}`);
    return ha - hb;
  });
}

function hashForShuffle(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function cardKindConfig(kind: SerializedFahamCard["kind"]): {
  label: string;
  classes: string;
  rowClasses: string;
  numberClasses: string;
} {
  switch (kind) {
    case "mastered":
      return {
        label: "Mahir",
        classes: "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/20 dark:text-emerald-300",
        rowClasses: "border-emerald-200 bg-emerald-50/60 dark:border-emerald-400/25 dark:bg-emerald-900/30",
        numberClasses: "bg-emerald-200 text-emerald-800 dark:bg-emerald-400/30 dark:text-emerald-200",
      };
    case "due":
      return {
        label: "Ulang",
        classes: "bg-sky-100 text-sky-700 dark:bg-sky-400/20 dark:text-sky-300",
        rowClasses: "border-sky-200 bg-sky-50/60 dark:border-sky-400/25 dark:bg-sky-900/30",
        numberClasses: "bg-sky-200 text-sky-800 dark:bg-sky-400/30 dark:text-sky-200",
      };
    case "new":
      return {
        label: "Baharu",
        classes: "bg-violet-100 text-violet-700 dark:bg-violet-400/20 dark:text-violet-300",
        rowClasses: "border-violet-200 bg-violet-50/60 dark:border-violet-400/25 dark:bg-violet-900/30",
        numberClasses: "bg-violet-200 text-violet-800 dark:bg-violet-400/30 dark:text-violet-200",
      };
  }
}

function queueItems(snapshot: FahamQueueSnapshot): SerializedFahamCard[] {
  return [
    ...shuffleSegment(snapshot.due),
    ...shuffleSegment(snapshot.learning),
    ...shuffleSegment(snapshot.new),
    ...shuffleSegment(snapshot.mastered),
  ];
}

function formatMetricValue(value: number | null): string {
  if (value === null) {
    return "...";
  }

  return value.toLocaleString();
}

async function requestQueue(
  preset: FahamSourcePreset,
  directionMode: FahamMcqDirectionMode,
  isRevision: boolean = false,
): Promise<FahamQueueSnapshot> {
  const response = await fetch("/api/faham/queue", {
    body: JSON.stringify({
      directionMode,
      preferredSources: FAHAM_PRESET_CONFIGS[preset].preferredSources,
      isRevision,
    }),
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error("Failed to fetch Faham queue");
  }

  return (await response.json()) as FahamQueueSnapshot;
}

function optionButtonClassName(params: {
  answerState: AnswerState | null;
  index: number;
  isPending: boolean;
  isSelected: boolean;
  correctIndex: number;
}): string {
  const { answerState, correctIndex, index, isPending, isSelected } = params;

  if (!answerState) {
    return [
      "border-stone-200 bg-white/90 text-stone-800 hover:-translate-y-0.5 hover:border-amber-300 hover:bg-amber-50",
      "dark:border-stone-700 dark:bg-stone-950/70 dark:text-stone-100 dark:hover:border-amber-500/50 dark:hover:bg-amber-950/40",
      isPending ? "opacity-50" : "",
    ].join(" ");
  }

  if (index === correctIndex) {
    return "border-emerald-300 bg-emerald-100 text-emerald-950 dark:border-emerald-500/50 dark:bg-emerald-950/40 dark:text-emerald-100";
  }

  if (isSelected) {
    return "border-rose-300 bg-rose-100 text-rose-950 dark:border-rose-500/50 dark:bg-rose-950/40 dark:text-rose-100";
  }

  return "border-stone-200 bg-stone-100/80 text-stone-500 dark:border-stone-700 dark:bg-stone-900/70 dark:text-stone-400";
}

export interface FahamStats {
  wordBank: number;
  mastered: number;
  learning: number;
  dueToday: number;
  retentionRate7d: number;
  levelProgress?: FahamLevelProgress;
}

interface FahamSessionSummary {
  correctCount: number;
  foundCount: number;
  masteredCount: number;
  totalCount: number;
}

async function requestStats(): Promise<FahamStats> {
  const response = await fetch("/api/faham/stats");
  if (!response.ok) {
    throw new Error("Failed to fetch Faham stats");
  }

  return (await response.json()) as FahamStats;
}

export function FahamWorkspace({
  initialQueue,
  initialPreset = "mixed",
  initialStats = null,
  entryContext = null,
  setupMessage = null,
  shouldHydrateInitialQueue = false,
}: FahamWorkspaceProps) {
  const [isConfigExpanded, setIsConfigExpanded] = useState(false);
  const [preset, setPreset] = useState<FahamSourcePreset>(initialPreset);
  const [directionMode, setDirectionMode] = useState<FahamMcqDirectionMode>("arab_to_bm");
  const [isRevision, setIsRevision] = useState(false);
  const [snapshot, setSnapshot] = useState<FahamQueueSnapshot>(initialQueue);
  const [stats, setStats] = useState<FahamStats | null>(initialStats);
  const [showCelebration, setShowCelebration] = useState(false);
  const [sessionSummary, setSessionSummary] = useState<FahamSessionSummary | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answerState, setAnswerState] = useState<AnswerState | null>(null);
  const [sessionDoneCount, setSessionDoneCount] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(() => {
    if (typeof window === "undefined") {
      return true;
    }
    return window.localStorage.getItem("miftah:faham:audio-enabled") !== "0";
  });
  const [correctAdvanceMode, setCorrectAdvanceMode] = useState<FahamCorrectAdvanceMode>(() => {
    if (typeof window === "undefined") {
      return "normal";
    }

    const savedMode = window.localStorage.getItem(CORRECT_ADVANCE_STORAGE_KEY);
    if (
      savedMode === "fast" ||
      savedMode === "normal" ||
      savedMode === "pause"
    ) {
      return savedMode;
    }

    return "normal";
  });
  const [isPending, startTransition] = useTransition();
  const [isHydratingInitialQueue, setIsHydratingInitialQueue] = useState(
    shouldHydrateInitialQueue,
  );
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);
  const lastAutoplayKeyRef = useRef<string | null>(null);
  const prevMasteredRef = useRef<number | null>(null);
  const sessionCorrectCountRef = useRef(0);
  const cards = useMemo(() => queueItems(snapshot), [snapshot]);
  const currentCard = cards[currentIndex] ?? null;
  const levelProgress = stats?.levelProgress ?? snapshot.levelProgress;
  const foundCount = stats?.wordBank ?? 0;
  const masteredCount = stats?.mastered ?? 0;
  const hasLiveStats = stats !== null;
  const foundCap = levelProgress.activeWordLimit;
  const progressPct = cards.length > 0 ? ((currentIndex + 1) / cards.length) * 100 : 0;
  const foundShare = foundCap > 0 ? Math.min(1, foundCount / foundCap) : 0;
  const masteredShare = foundCount > 0 ? Math.min(1, masteredCount / foundCount) : 0;

  const stopActiveAudio = useCallback(() => {
    const activeAudio = activeAudioRef.current;
    if (!activeAudio) {
      return;
    }

    activeAudio.pause();
    activeAudio.currentTime = 0;
    activeAudioRef.current = null;
  }, []);

  const playFeedbackSound = useCallback((kind: "correct" | "incorrect" | "mastered" | "session_complete") => {
    if (!audioEnabled) return;
    
    const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const scheduleTone = (
      frequency: number,
      startAt: number,
      duration: number,
      type: OscillatorType,
      volume: number,
    ) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = type;
      osc.frequency.setValueAtTime(frequency, startAt);
      gain.gain.setValueAtTime(volume, startAt);
      gain.gain.exponentialRampToValueAtTime(0.01, startAt + duration);
      osc.start(startAt);
      osc.stop(startAt + duration);
    };

    if (kind === "session_complete") {
      scheduleTone(523.25, now, 0.24, "triangle", 0.18);
      scheduleTone(659.25, now + 0.12, 0.24, "triangle", 0.18);
      scheduleTone(783.99, now + 0.24, 0.28, "triangle", 0.18);
      scheduleTone(1046.5, now + 0.38, 0.42, "sine", 0.22);
      scheduleTone(1318.51, now + 0.52, 0.42, "sine", 0.18);
      return;
    }

    if (kind === "mastered") {
      scheduleTone(523.25, now, 0.18, "square", 0.1);
      scheduleTone(659.25, now + 0.1, 0.18, "square", 0.1);
      scheduleTone(783.99, now + 0.2, 0.18, "square", 0.1);
      scheduleTone(1046.5, now + 0.3, 0.32, "square", 0.1);
      return;
    }

    if (kind === "correct") {
      scheduleTone(523.25, now, 0.1, "sine", 0.2);
      scheduleTone(1046.5, now + 0.08, 0.28, "sine", 0.16);
      return;
    }

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "triangle";
    osc.frequency.setValueAtTime(110, now);
    osc.frequency.linearRampToValueAtTime(80, now + 0.2);
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
    osc.start(now);
    osc.stop(now + 0.3);
  }, [audioEnabled]);

  const resetSessionTracking = useCallback(() => {
    sessionCorrectCountRef.current = 0;
  }, []);

  const applyStats = useCallback((newStats: FahamStats, celebrateMastered: boolean) => {
    if (
      celebrateMastered &&
      prevMasteredRef.current !== null &&
      newStats.mastered > prevMasteredRef.current
    ) {
      setShowCelebration(true);
      playFeedbackSound("mastered");
      setTimeout(() => setShowCelebration(false), 4000);
    }

    prevMasteredRef.current = newStats.mastered;
    setStats(newStats);
  }, [playFeedbackSound]);

  const refreshStats = useCallback(async (celebrateMastered: boolean) => {
    try {
      const latestStats = await requestStats();
      applyStats(latestStats, celebrateMastered);
      return latestStats;
    } catch (error) {
      console.error(error);
      return null;
    }
  }, [applyStats]);

  const reloadQueue = (
    nextPreset: FahamSourcePreset,
    nextDirectionMode: FahamMcqDirectionMode,
    nextIsRevision: boolean = false,
  ) => {
    startTransition(() => {
      void requestQueue(nextPreset, nextDirectionMode, nextIsRevision)
        .then((nextSnapshot) => {
          setPreset(nextPreset);
          setDirectionMode(nextDirectionMode);
          setIsRevision(nextIsRevision);
          setSnapshot(nextSnapshot);
          setCurrentIndex(0);
          setAnswerState(null);
          setErrorMessage(null);
          setSessionSummary(null);
          setShowPreview(true);
          resetSessionTracking();
        })
        .catch(() => {
          setErrorMessage("Barisan Faham tak dapat dimuat sekarang.");
        })
        .finally(() => {
          setIsHydratingInitialQueue(false);
        });
    });
  };

  useEffect(() => {
    if (!shouldHydrateInitialQueue) {
      return;
    }

    startTransition(() => {
      void requestQueue(initialPreset, "arab_to_bm")
        .then((nextSnapshot) => {
          setPreset(initialPreset);
          setDirectionMode("arab_to_bm");
          setIsRevision(false);
          setSnapshot(nextSnapshot);
          setCurrentIndex(0);
          setAnswerState(null);
          setErrorMessage(null);
          setSessionSummary(null);
          resetSessionTracking();
        })
        .catch(() => {
          setErrorMessage("Barisan Faham tak dapat dimuat sekarang.");
        })
        .finally(() => {
          setIsHydratingInitialQueue(false);
        });
    });
  }, [initialPreset, resetSessionTracking, shouldHydrateInitialQueue, startTransition]);

  const moveToNextCard = useCallback(async () => {
    const nextIndex = currentIndex + 1;

    if (nextIndex < cards.length) {
      setCurrentIndex(nextIndex);
      setAnswerState(null);
      setErrorMessage(null);
      setSessionDoneCount((value) => value + 1);
      return;
    }

    const completedSessionTotal = cards.length;
    const completedSessionCorrect = sessionCorrectCountRef.current;

    stopActiveAudio();
    playFeedbackSound("session_complete");
    setSessionSummary({
      correctCount: completedSessionCorrect,
      foundCount: foundCount,
      masteredCount: masteredCount,
      totalCount: completedSessionTotal,
    });
    resetSessionTracking();
    setSessionDoneCount((value) => value + 1);

    // Load next queue and refresh stats in the background
    const [latestStats, refreshed] = await Promise.all([
      refreshStats(false),
      requestQueue(preset, directionMode, isRevision),
    ]);
    setSnapshot(refreshed);
    setCurrentIndex(0);
    setAnswerState(null);
    setErrorMessage(null);
    setShowPreview(true);
    if (latestStats) {
      setSessionSummary((prev) =>
        prev
          ? { ...prev, foundCount: latestStats.wordBank, masteredCount: latestStats.mastered }
          : prev,
      );
    }
  }, [
    cards.length,
    currentIndex,
    directionMode,
    foundCount,
    isRevision,
    masteredCount,
    playFeedbackSound,
    preset,
    refreshStats,
    resetSessionTracking,
    stopActiveAudio,
  ]);

  const handleAnswer = (selectedIndex: number) => {
    if (!currentCard || answerState || isPending) {
      return;
    }

    if (selectedIndex === currentCard.mcq.correctIndex) {
      sessionCorrectCountRef.current += 1;
    }

    setAnswerState({
      isCorrect: selectedIndex === currentCard.mcq.correctIndex,
      selectedIndex,
    });

    playFeedbackSound(selectedIndex === currentCard.mcq.correctIndex ? "correct" : "incorrect");
  };

  const handleToggleAudio = () => {
    setAudioEnabled((prev) => {
      const next = !prev;
      window.localStorage.setItem("miftah:faham:audio-enabled", next ? "1" : "0");
      return next;
    });
  };

  const handleCorrectAdvanceModeChange = (mode: FahamCorrectAdvanceMode) => {
    setCorrectAdvanceMode(mode);
    window.localStorage.setItem(CORRECT_ADVANCE_STORAGE_KEY, mode);
  };

  const playWordAudio = useCallback((params: {
    text: string;
    lang: "ar" | "ms";
    explicitUrl?: string | null;
    autoplayKey?: string;
  }) => {
    const { autoplayKey, explicitUrl, lang, text } = params;
    if (!audioEnabled || !text) {
      return;
    }

    if (autoplayKey && lastAutoplayKeyRef.current === autoplayKey) {
      return;
    }

    const normalizedExplicitUrl =
      typeof explicitUrl === "string" ? explicitUrl.trim() : "";
    // Quranic Arabic must come from recitation audio; never fallback to TTS.
    const url =
      normalizedExplicitUrl.length > 0
        ? normalizedExplicitUrl
        : lang === "ms"
          ? `/api/audio/tts?text=${encodeURIComponent(text)}&lang=ms&voice=male&v=2`
          : null;
    if (!url) {
      return;
    }

    stopActiveAudio();

    const audio = new Audio(url);
    activeAudioRef.current = audio;
    if (autoplayKey) {
      lastAutoplayKeyRef.current = autoplayKey;
    }

    const clearActiveAudio = () => {
      if (activeAudioRef.current === audio) {
        activeAudioRef.current = null;
      }
    };

    audio.addEventListener("ended", clearActiveAudio, { once: true });
    audio.addEventListener("error", clearActiveAudio, { once: true });
    audio.play().catch(() => {
      clearActiveAudio();
      // Ignore autoplay blocks or failures
    });
  }, [audioEnabled, stopActiveAudio]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void refreshStats(true);
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [refreshStats, sessionDoneCount]);

  useEffect(() => {
    return () => {
      stopActiveAudio();
    };
  }, [stopActiveAudio]);

  useEffect(() => {
    if (!audioEnabled) {
      stopActiveAudio();
    }
  }, [audioEnabled, stopActiveAudio]);

  // Autoplay prompt when card changes
  useEffect(() => {
    if (currentCard && !answerState && !sessionSummary) {
      playWordAudio({
        autoplayKey: `prompt:${currentCard.progressId}`,
        explicitUrl: currentCard.mcq.promptAudioUrl,
        lang: currentCard.mcq.promptLang,
        text: currentCard.mcq.promptPrimary,
      });
    }
  }, [answerState, currentCard, playWordAudio, sessionSummary]);

  const handleManualAudio = (lang: "ar" | "ms", text: string, explicitUrl?: string | null) => {
    playWordAudio({ explicitUrl, lang, text });
  };

  const handleContinue = useCallback(() => {
    if (!currentCard || !answerState) {
      return;
    }

    const rating = answerState.isCorrect ? 3 : 1;
    startTransition(() => {
      void fetch("/api/faham/rate", {
        body: JSON.stringify({
          progressId: currentCard.progressId,
          rating,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error("Rating failed");
          }

          await moveToNextCard();
        })
        .catch(() => {
          setErrorMessage("Jawapan tak dapat disimpan. Cuba sekali lagi.");
        });
    });
  }, [answerState, currentCard, moveToNextCard, startTransition]);

  // Autoplay correct answer when selection result appears + Auto-continue
  useEffect(() => {
    if (currentCard && answerState) {
      const lang = currentCard.mcq.direction === "bm_to_arab" ? "ar" : "ms";
      playWordAudio({
        autoplayKey: `answer:${currentCard.progressId}`,
        explicitUrl: currentCard.mcq.answerAudioUrl,
        lang,
        text: currentCard.mcq.answerPrimary,
      });

      // Auto-continue to next card after 3 seconds if correct
      if (answerState.isCorrect) {
        const delayMs = CORRECT_ADVANCE_CONFIGS[correctAdvanceMode].delayMs;
        if (delayMs === null) {
          return;
        }

        const timer = setTimeout(() => {
          handleContinue();
        }, delayMs);
        return () => clearTimeout(timer);
      }
    }
  }, [answerState, correctAdvanceMode, currentCard, handleContinue, playWordAudio]);

  useEffect(() => {
    if (!sessionSummary) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSessionSummary(null);
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [sessionSummary]);

  const sessionSummaryModal =
    sessionSummary && typeof document !== "undefined"
      ? createPortal(
          <div
            className="fixed inset-0 z-[300] flex items-center justify-center bg-stone-950/55 px-4 backdrop-blur-sm"
            onClick={() => setSessionSummary(null)}
          >
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="faham-session-summary-title"
              className="animate-bounce-in relative w-full max-w-sm rounded-[2rem] border border-teal-200/80 bg-[linear-gradient(160deg,rgba(240,253,250,0.98),rgba(255,255,255,0.98))] p-6 shadow-[0_30px_90px_-35px_rgba(20,184,166,0.4)] dark:border-teal-500/30 dark:bg-[linear-gradient(160deg,rgba(15,118,110,0.35),rgba(17,24,39,0.95))]"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="text-center">
                <p className="text-6xl font-bold tracking-tight text-teal-700 dark:text-teal-300">
                  {sessionSummary.correctCount}/{sessionSummary.totalCount}
                </p>
                <p
                  id="faham-session-summary-title"
                  className="mt-2 text-sm font-medium text-stone-500 dark:text-stone-400"
                >
                  Jawapan betul
                </p>
                <div className="mt-4 flex justify-center gap-6 text-sm text-stone-500 dark:text-stone-400">
                  <span>Ditemui <strong className="text-stone-700 dark:text-stone-200">{formatMetricValue(sessionSummary.foundCount)}</strong></span>
                  <span>Mahir <strong className="text-stone-700 dark:text-stone-200">{formatMetricValue(sessionSummary.masteredCount)}</strong></span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSessionSummary(null)}
                className="mt-6 inline-flex w-full items-center justify-center rounded-2xl bg-teal-600 px-5 py-3 text-base font-semibold text-white transition hover:bg-teal-700 dark:bg-teal-500 dark:text-teal-950 dark:hover:bg-teal-400"
              >
                Seterusnya
              </button>
            </section>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="relative flex flex-col gap-6">
      {showCelebration && (
        <div className="pointer-events-none fixed inset-x-0 top-24 z-[100] flex justify-center px-4 sm:top-32">
          <div className="animate-bounce-in flex items-center gap-3 rounded-full border border-emerald-200 bg-emerald-50/95 px-6 py-3 shadow-[0_20px_40px_-15px_rgba(16,185,129,0.4)] backdrop-blur dark:border-emerald-500/30 dark:bg-emerald-950/90">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500 text-white shadow-[0_0_15px_rgba(16,185,129,0.5)]">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <path d="M20 6L9 17L4 12" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="text-left">
              <p className="text-sm font-bold uppercase tracking-widest text-emerald-600 sm:text-base dark:text-emerald-400">Tahniah! +1 Dikuasai</p>
              <p className="text-base font-bold text-emerald-950 sm:text-lg dark:text-emerald-50">Perkataan Baru Dikuasai</p>
            </div>
          </div>
        </div>
      )}

      {sessionSummaryModal}

      {errorMessage ? (
        <section className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
          {errorMessage}
        </section>
      ) : null}

      {setupMessage ? (
        <section className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800 dark:border-sky-900/40 dark:bg-sky-900/20 dark:text-sky-200">
          {setupMessage}
        </section>
      ) : null}

      {entryContext ? (
        <section className="rounded-[1.75rem] border border-indigo-200/80 bg-[linear-gradient(135deg,rgba(238,242,255,0.9),rgba(255,255,255,0.94))] p-5 shadow-[0_22px_60px_-42px_rgba(79,70,229,0.45)] dark:border-indigo-500/25 dark:bg-[linear-gradient(135deg,rgba(49,46,129,0.3),rgba(12,10,9,0.9))]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-3xl">
              <span className="inline-flex rounded-full border border-indigo-300/80 bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-indigo-700 dark:border-indigo-400/30 dark:bg-indigo-950/40 dark:text-indigo-200">
                {entryContext.badge}
              </span>
              <h2 className="mt-3 text-2xl font-medium tracking-tight text-stone-900 dark:text-stone-50">
                {entryContext.title}
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-stone-600 dark:text-stone-300">
                {entryContext.description}
              </p>
            </div>

            <Link
              href={entryContext.href}
              className="inline-flex items-center justify-center rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-800 transition hover:bg-stone-100 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100 dark:hover:bg-stone-800"
            >
              {entryContext.hrefLabel}
            </Link>
          </div>
        </section>
      ) : null}

      {snapshot.blockedReason === "due_backlog" && !isHydratingInitialQueue ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-200">
          Kad baharu dijeda sementara kerana baki ulang kaji masih tinggi.
          Selesaikan kad ulang kaji dahulu, kemudian enjin akan membuka kad
          baharu semula.
        </section>
      ) : null}

      <section className="grid grid-cols-2 gap-2 sm:gap-3">
        <MotivationMetricCard
          label="Ditemui"
          progress={foundShare}
          progressLabel={
            foundCap > 0
              ? `${formatMetricValue(foundCount)}/${formatMetricValue(foundCap)} cap`
              : "Tiada cap"
          }
          value={formatMetricValue(hasLiveStats ? foundCount : null)}
        />
        <MotivationMetricCard
          label="Dikuasai"
          progress={masteredShare}
          progressLabel={
            foundCount > 0
              ? `${formatMetricValue(masteredCount)}/${formatMetricValue(foundCount)} ditemui`
              : "Belum mula"
          }
          value={formatMetricValue(hasLiveStats ? masteredCount : null)}
        />
      </section>

      {showPreview && cards.length > 0 ? (
        <section className="animate-fade-in-up rounded-[2rem] border border-stone-200/90 bg-white/88 p-5 shadow-[0_30px_80px_-52px_rgba(41,37,36,0.65)] backdrop-blur-sm sm:p-7 dark:border-stone-700 dark:bg-stone-900/80">
          <h3 className="mb-1 text-lg font-semibold text-stone-800 dark:text-stone-100">
            Kad Sesi Ini
          </h3>
          <div className="mb-4 flex gap-3 text-xs font-medium">
            {cards.filter((c) => c.kind === "new").length > 0 ? (
              <span className="text-violet-600 dark:text-violet-300">
                {cards.filter((c) => c.kind === "new").length} Baharu
              </span>
            ) : null}
            {cards.filter((c) => c.kind === "due").length > 0 ? (
              <span className="text-sky-600 dark:text-sky-300">
                {cards.filter((c) => c.kind === "due").length} Ulang
              </span>
            ) : null}
            {cards.filter((c) => c.kind === "mastered").length > 0 ? (
              <span className="text-emerald-600 dark:text-emerald-300">
                {cards.filter((c) => c.kind === "mastered").length} Mahir
              </span>
            ) : null}
          </div>
          <div className="space-y-2.5">
            {cards.map((card, index) => {
              const statusConfig = cardKindConfig(card.kind);
              return (
                <div
                  key={card.progressId}
                  className={`flex items-center gap-3 rounded-xl border px-4 py-3.5 ${statusConfig.rowClasses}`}
                >
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${statusConfig.numberClasses}`}>
                    {index + 1}
                  </span>
                  <span dir="rtl" lang="ar" className="min-w-[3rem] font-arabic text-xl text-stone-900 dark:text-stone-50">
                    {card.word.textUthmani}
                  </span>
                  <span className="text-stone-400 dark:text-stone-600">&mdash;</span>
                  <span className="flex-1 text-sm text-stone-600 dark:text-stone-200">
                    {card.word.translationBm}
                  </span>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[0.65rem] font-bold uppercase tracking-wider ${statusConfig.classes}`}>
                    {statusConfig.label}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="mt-6 border-t border-stone-200/60 pt-5 dark:border-stone-700/40">
            <button
              type="button"
              onClick={() => setShowPreview(false)}
              className="w-full rounded-2xl bg-[linear-gradient(135deg,#0d9488,#6366f1)] px-6 py-4 text-lg font-bold tracking-wide text-white shadow-lg transition hover:shadow-xl hover:brightness-110 active:scale-[0.98] dark:bg-[linear-gradient(135deg,#0f766e,#4f46e5)] dark:text-white"
            >
              Mula Sesi &rarr;
            </button>
          </div>
        </section>
      ) : null}

      {!showPreview && currentCard ? (
        <section className="animate-fade-in-up rounded-[2rem] border border-stone-200/90 bg-white/88 p-5 shadow-[0_30px_80px_-52px_rgba(41,37,36,0.65)] backdrop-blur-sm sm:p-7 dark:border-stone-700 dark:bg-stone-900/80">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleToggleAudio}
              className={`group flex items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-semibold transition shadow-sm sm:text-base ${
                audioEnabled
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/40 dark:bg-emerald-900/30 dark:text-emerald-300"
                  : "border-stone-200 bg-stone-50 text-stone-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-400"
              }`}
            >
              {audioEnabled ? (
                <>
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M11 5L6 9H2v6h4l5 4V5z" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Audio On
                </>
              ) : (
                <>
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M11 5L6 9H2v6h4l5 4V5z" strokeLinecap="round" strokeLinejoin="round" />
                    <line x1="23" y1="9" x2="17" y2="15" strokeLinecap="round" strokeLinejoin="round" />
                    <line x1="17" y1="9" x2="23" y2="15" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Audio Off
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => setIsConfigExpanded((value) => !value)}
              className={`flex items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-semibold transition shadow-sm sm:text-base ${
                isConfigExpanded
                  ? "border-amber-300 bg-amber-100 text-amber-950 dark:border-amber-500/30 dark:bg-amber-900/50"
                  : "border-stone-200 bg-white text-stone-600 hover:border-stone-300 hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300 dark:hover:bg-stone-800"
              }`}
              aria-expanded={isConfigExpanded}
            >
              <svg
                className={`h-3.5 w-3.5 transition-transform duration-300 ${isConfigExpanded ? "rotate-180" : ""}`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <path d="M12 5v14M5 12l7 7 7-7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {isConfigExpanded ? "Tutup Pilihan Tambahan" : "Pilihan Tambahan"}
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3">
            <div className="min-w-32">
              <div className="flex items-center justify-between text-sm text-stone-500 sm:text-base dark:text-stone-400">
                <span>
                  {currentIndex + 1} / {cards.length}
                </span>
                <span>{Math.round(progressPct)}%</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-800">
                <div
                  className="h-full rounded-full bg-[linear-gradient(90deg,#0d9488,#6366f1)] transition-[width] duration-300 dark:bg-[linear-gradient(90deg,#14b8a6,#818cf8)]"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          </div>

          <div className="mt-8 grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="rounded-[1.75rem] border border-teal-200/70 bg-[radial-gradient(circle_at_top,rgba(20,184,166,0.1),transparent_55%),linear-gradient(180deg,rgba(240,253,250,0.92),rgba(255,255,255,0.96))] p-6 dark:border-teal-500/25 dark:bg-[radial-gradient(circle_at_top,rgba(20,184,166,0.15),transparent_55%),linear-gradient(180deg,rgba(17,24,39,0.92),rgba(12,10,9,0.96))]">
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-stone-500 sm:text-base dark:text-stone-400">
                {currentCard.mcq.promptLabel}
              </p>
              <p className="mt-3 text-base leading-relaxed text-stone-600 dark:text-stone-300">
                {currentCard.mcq.promptHint}
              </p>
              <p
                dir={currentCard.mcq.promptDir}
                lang={currentCard.mcq.promptLang}
                onClick={() => handleManualAudio(currentCard.mcq.promptLang, currentCard.mcq.promptPrimary, currentCard.mcq.promptAudioUrl)}
                className={`mt-10 cursor-pointer text-center leading-tight text-stone-950 transition hover:scale-[1.03] active:scale-95 sm:text-6xl dark:text-stone-50 ${
                  currentCard.mcq.promptLang === "ar"
                    ? "font-arabic text-5xl"
                    : "text-4xl font-semibold"
                }`}
                title="Tekan untuk dengar audio"
              >
                {currentCard.mcq.promptPrimary}
              </p>
            </div>

            <div className="space-y-3">
              {currentCard.mcq.options.map((option, index) => {
                const isSelected = answerState?.selectedIndex === index;
                const label = String.fromCharCode(65 + index);

                return (
                  <button
                    key={`${currentCard.progressId}-${option.lang}-${option.value}`}
                    type="button"
                    disabled={Boolean(answerState) || isPending}
                    onClick={() => handleAnswer(index)}
                    className={`w-full rounded-[1.35rem] border px-4 py-4 text-left transition ${optionButtonClassName({
                      answerState,
                      correctIndex: currentCard.mcq.correctIndex,
                      index,
                      isPending,
                      isSelected,
                    })} ${isSelected && !answerState?.isCorrect ? "animate-shake" : ""}`}
                  >
                    <span className="flex items-start gap-3">
                      <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-current/15 bg-white/70 text-sm font-semibold dark:bg-white/10">
                        {label}
                      </span>
                      <span
                        dir={option.dir}
                        lang={option.lang}
                        className={`leading-relaxed ${
                          option.lang === "ar"
                            ? "font-arabic text-2xl"
                            : "text-base font-medium"
                        }`}
                      >
                        {option.value}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>



          {answerState ? (
            <div
              className={`mt-6 rounded-[1.5rem] border p-4 sm:p-5 ${
                answerState.isCorrect
                  ? "border-emerald-200 bg-emerald-50 dark:border-emerald-700/40 dark:bg-emerald-950/30"
                  : "border-rose-200 bg-rose-50 dark:border-rose-700/40 dark:bg-rose-950/30"
              }`}
            >
              <p
                className={`text-base font-semibold ${
                  answerState.isCorrect
                    ? "text-emerald-800 dark:text-emerald-200"
                    : "text-rose-800 dark:text-rose-200"
                }`}
              >
                {answerState.isCorrect ? "Betul!" : "Kurang tepat."}
              </p>

              <p className="mt-2 text-base text-stone-800 dark:text-stone-100">
                {currentCard.mcq.answerLabel}:{" "}
                <span
                  dir={currentCard.mcq.direction === "bm_to_arab" ? "rtl" : "ltr"}
                  lang={currentCard.mcq.direction === "bm_to_arab" ? "ar" : "ms"}
                  onClick={() => {
                    const lang = currentCard.mcq.direction === "bm_to_arab" ? "ar" : "ms";
                    handleManualAudio(lang, currentCard.mcq.answerPrimary, currentCard.mcq.answerAudioUrl);
                  }}
                  className={`cursor-pointer transition hover:opacity-75 ${
                    currentCard.mcq.direction === "bm_to_arab"
                      ? "font-arabic text-2xl"
                      : "font-medium"
                  }`}
                  title="Tekan untuk dengar"
                >
                  {currentCard.mcq.answerPrimary}
                </span>
                {currentCard.mcq.answerSecondary && currentCard.mcq.direction !== "bm_to_arab" ? (
                  <span className="ml-2 text-sm text-stone-500 dark:text-stone-400">
                    ({currentCard.mcq.answerSecondary})
                  </span>
                ) : null}
              </p>

              {(currentCard.sourceContext?.primaryReference ||
                (currentCard.sourceContext?.sources.length ?? 0) > 0) && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {currentCard.sourceContext?.primaryReference ? (
                    currentCard.sourceContext.primaryReference.href ? (
                      <Link
                        href={currentCard.sourceContext.primaryReference.href}
                        className="rounded-full border border-stone-300/70 bg-stone-100/80 px-2.5 py-0.5 text-xs font-medium text-stone-700 transition hover:bg-stone-200 dark:border-stone-600/50 dark:bg-stone-800/60 dark:text-stone-200 dark:hover:bg-stone-700"
                      >
                        Ayat {currentCard.sourceContext.primaryReference.label}
                      </Link>
                    ) : (
                      <span className="rounded-full border border-stone-300/70 bg-stone-100/80 px-2.5 py-0.5 text-xs font-medium text-stone-700 dark:border-stone-600/50 dark:bg-stone-800/60 dark:text-stone-200">
                        Ayat {currentCard.sourceContext.primaryReference.label}
                      </span>
                    )
                  ) : null}
                  {currentCard.sourceContext?.sources.map((source) => (
                    <Link
                      key={`${currentCard.progressId}-${source.type}-${source.href}`}
                      href={source.href}
                      className="rounded-full border border-stone-300/70 bg-stone-100/80 px-2.5 py-0.5 text-xs font-medium text-stone-700 transition hover:bg-stone-200 dark:border-stone-600/50 dark:bg-stone-800/60 dark:text-stone-200 dark:hover:bg-stone-700"
                      title={source.detail}
                    >
                      {source.label}
                    </Link>
                  ))}
                </div>
              )}

              <button
                type="button"
                disabled={isPending}
                onClick={handleContinue}
                className="mt-4 w-full rounded-xl bg-stone-900 py-2.5 text-base font-medium text-stone-50 transition hover:bg-stone-800 disabled:opacity-50 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-300"
              >
                {isPending ? "Menyimpan..." : "Kad seterusnya"}
              </button>
            </div>
          ) : null}
        </section>
      ) : isHydratingInitialQueue ? (
        <section className="animate-fade-in-up rounded-3xl border border-stone-200/90 bg-white/88 p-8 shadow-[0_25px_70px_-48px_rgba(28,25,23,0.55)] backdrop-blur-sm dark:border-stone-700 dark:bg-stone-900/80">
          <div className="space-y-6" aria-hidden>
            <div className="h-6 w-40 rounded-full bg-stone-200/80 dark:bg-stone-800" />
            <div className="h-12 w-3/4 rounded-3xl bg-stone-200/80 dark:bg-stone-800" />
            <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
              <div className="h-64 rounded-[1.75rem] bg-stone-200/75 dark:bg-stone-800" />
              <div className="space-y-3">
                <div className="h-20 rounded-[1.35rem] bg-stone-200/75 dark:bg-stone-800" />
                <div className="h-20 rounded-[1.35rem] bg-stone-200/75 dark:bg-stone-800" />
                <div className="h-20 rounded-[1.35rem] bg-stone-200/75 dark:bg-stone-800" />
                <div className="h-20 rounded-[1.35rem] bg-stone-200/75 dark:bg-stone-800" />
              </div>
            </div>
          </div>
          <p className="mt-6 text-sm text-stone-600 dark:text-stone-300">
            Barisan ulang kaji sedang disusun ikut pendedahan dan kad yang due.
          </p>
        </section>
      ) : showPreview ? null : (
        <section className="animate-fade-in-up rounded-3xl border border-stone-200/90 bg-white/88 p-8 text-center shadow-[0_25px_70px_-48px_rgba(28,25,23,0.55)] backdrop-blur-sm dark:border-stone-700 dark:bg-stone-900/80">
          <p className="text-2xl font-medium text-stone-900 dark:text-stone-100">
            Belum ada kad Faham buat masa ini.
          </p>
          <p className="mt-2 text-base text-stone-600 dark:text-stone-300">
            Teruskan membaca atau buka tema dahulu supaya enjin ini mempunyai
            pendedahan yang cukup untuk membuka kad baharu.
          </p>
        </section>
      )}

      {isConfigExpanded ? (
        <section className="rounded-[2rem] border border-stone-200/85 bg-white/85 p-5 shadow-[0_30px_80px_-52px_rgba(41,37,36,0.4)] backdrop-blur-sm sm:p-7 dark:border-stone-600/70 dark:bg-stone-950/88">
          <aside className="animate-in fade-in slide-in-from-top-2 duration-300 rounded-[1.75rem] border border-stone-200/80 bg-white/80 p-5 shadow-xl backdrop-blur-md dark:border-white/10 dark:bg-stone-900/88">
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold uppercase tracking-[0.22em] text-stone-500 sm:text-base dark:text-stone-200">
                  Susun deck sesi ini
                </p>
                <span className="rounded-full border border-stone-200 bg-white px-3 py-1 text-sm font-bold text-stone-600 sm:text-base dark:border-white/10 dark:bg-white/10 dark:text-stone-100">
                  {FAHAM_PRESET_CONFIGS[preset].shortLabel}
                </span>
              </div>

              <div className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
                <div className="space-y-4">
                  <div>
                    <p className="text-sm font-bold uppercase tracking-[0.2em] text-stone-500 sm:text-base dark:text-stone-200">
                      Sumber deck
                    </p>
                    <p className="mt-1 text-sm text-stone-600 sm:text-base dark:text-stone-100">
                      Pilih sumber pendedahan yang paling dekat dengan fokus bacaan anda sekarang.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {(Object.keys(FAHAM_PRESET_CONFIGS) as FahamSourcePreset[]).map((key) => {
                      const active = preset === key;
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => reloadQueue(key, directionMode)}
                          disabled={isPending}
                          className={`rounded-xl border px-3 py-2.5 text-left text-sm font-semibold transition sm:text-base ${
                            active
                              ? "border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-500/50 dark:bg-amber-900/30 dark:text-amber-100"
                              : "border-stone-200 bg-white text-stone-700 hover:bg-stone-100 dark:border-white/10 dark:bg-white/8 dark:text-stone-100 dark:hover:bg-white/14"
                          }`}
                        >
                          {FAHAM_PRESET_CONFIGS[key].label}
                        </button>
                      );
                    })}
                  </div>

                  <div className="rounded-xl border border-stone-200/80 bg-white/60 p-3 text-sm leading-relaxed text-stone-600 sm:text-base dark:border-white/10 dark:bg-white/8 dark:text-stone-100">
                    {FAHAM_PRESET_CONFIGS[preset].helper}
                  </div>
                </div>

                <div className="space-y-4 border-t border-stone-200/80 pt-5 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0 dark:border-white/10">
                  <div>
                    <p className="text-sm font-bold uppercase tracking-[0.2em] text-stone-500 sm:text-base dark:text-stone-200">
                      Arah soalan
                    </p>
                    <p className="mt-1 text-sm text-stone-600 sm:text-base dark:text-stone-100">
                      {DIRECTION_CONFIGS[directionMode].helper}
                    </p>
                  </div>

                  <div className="grid gap-2">
                    {(Object.keys(DIRECTION_CONFIGS) as FahamMcqDirectionMode[]).map((key) => {
                      const active = directionMode === key;
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => reloadQueue(preset, key)}
                          disabled={isPending}
                          className={`rounded-xl border px-4 py-2.5 text-left transition ${
                            active
                              ? "border-teal-300 bg-teal-50 text-teal-900 dark:border-teal-500/50 dark:bg-teal-950/30 dark:text-teal-100"
                              : "border-stone-200 bg-white text-stone-700 hover:bg-stone-100 dark:border-white/10 dark:bg-white/8 dark:text-stone-100 dark:hover:bg-white/14"
                          }`}
                        >
                          <div className="text-sm font-bold sm:text-base">{DIRECTION_CONFIGS[key].label}</div>
                          <div className="mt-0.5 text-sm leading-tight text-stone-500 sm:text-base dark:text-stone-200">
                            {DIRECTION_CONFIGS[key].shortLabel}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <div className="rounded-[1.35rem] border border-stone-200/80 bg-stone-50/80 p-4 dark:border-white/10 dark:bg-white/8">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold uppercase tracking-[0.22em] text-stone-500 sm:text-base dark:text-stone-200">
                          Rentak selepas betul
                        </p>
                        <p className="mt-1 text-sm text-stone-600 sm:text-base dark:text-stone-100">
                          {CORRECT_ADVANCE_CONFIGS[correctAdvanceMode].helper}
                        </p>
                      </div>
                      <span className="rounded-full border border-stone-200 bg-white px-3 py-1 text-sm font-bold text-stone-600 sm:text-base dark:border-white/10 dark:bg-white/10 dark:text-stone-100">
                        {CORRECT_ADVANCE_CONFIGS[correctAdvanceMode].shortLabel}
                      </span>
                    </div>

                    <div className="mt-4 grid gap-2 sm:grid-cols-3">
                      {(Object.keys(CORRECT_ADVANCE_CONFIGS) as FahamCorrectAdvanceMode[]).map((mode) => {
                        const active = correctAdvanceMode === mode;
                        return (
                          <button
                            key={mode}
                            type="button"
                            onClick={() => handleCorrectAdvanceModeChange(mode)}
                            className={`rounded-xl border px-4 py-2.5 text-left transition ${
                              active
                                ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-500/50 dark:bg-emerald-950/30 dark:text-emerald-100"
                                : "border-stone-200 bg-white text-stone-700 hover:bg-stone-100 dark:border-white/10 dark:bg-white/8 dark:text-stone-100 dark:hover:bg-white/14"
                            }`}
                          >
                            <div className="text-sm font-bold sm:text-base">
                              {CORRECT_ADVANCE_CONFIGS[mode].label}
                            </div>
                            <div className="mt-0.5 text-sm leading-tight text-stone-500 sm:text-base dark:text-stone-200">
                              {CORRECT_ADVANCE_CONFIGS[mode].shortLabel}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </section>
      ) : null}
    </div>
  );
}

function MotivationMetricCard({
  label,
  progress,
  progressLabel,
  value,
}: {
  label: string;
  progress: number;
  progressLabel: string;
  value: string;
}) {
  const palette = {
    card:
      "border-emerald-300/70 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.18),transparent_55%),linear-gradient(180deg,rgba(236,253,245,0.95),rgba(255,255,255,0.98))] dark:border-emerald-500/35 dark:bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.22),transparent_55%),linear-gradient(180deg,rgba(2,44,34,0.50),rgba(28,25,23,0.92))]",
    progressBadge:
      "border-emerald-400/70 bg-emerald-100/90 text-emerald-900 dark:border-emerald-400/40 dark:bg-emerald-300/15 dark:text-emerald-50",
    progressBar: "bg-emerald-500 dark:bg-emerald-400",
    progressTrack: "bg-emerald-100 dark:bg-emerald-900/30",
    value: "text-emerald-950 dark:text-emerald-50",
  };

  return (
    <section className={`min-w-0 rounded-[1.5rem] border p-4 shadow-[0_20px_60px_-44px_rgba(41,37,36,0.55)] sm:p-5 ${palette.card}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-stone-500 sm:text-xs dark:text-stone-400">
            {label}
          </p>
          <p className={`mt-2 text-3xl font-semibold tracking-tight sm:text-4xl ${palette.value}`}>
            {value}
          </p>
        </div>

        <div className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold shadow-sm sm:px-3 sm:text-sm ${palette.progressBadge}`}>
          {Math.round(progress * 100)}%
        </div>
      </div>

      <div className="mt-4">
        <div className={`h-2 rounded-full ${palette.progressTrack}`}>
          <div
            className={`h-full rounded-full transition-[width] duration-500 ${palette.progressBar}`}
            style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }}
          />
        </div>
        <p className="mt-2 text-[11px] font-medium leading-tight text-stone-600 sm:text-xs dark:text-stone-300">
          {progressLabel}
        </p>
      </div>
    </section>
  );
}
