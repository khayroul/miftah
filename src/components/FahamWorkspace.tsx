"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
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

function queueItems(snapshot: FahamQueueSnapshot): SerializedFahamCard[] {
  return [...snapshot.due, ...snapshot.learning, ...snapshot.new, ...snapshot.mastered];
}

function dueLabel(count: number): string {
  return count === 1 ? "1 kad ulang kaji" : `${count} kad ulang kaji`;
}

function newLabel(count: number): string {
  return count === 1 ? "1 kad baharu" : `${count} kad baharu`;
}

function learningLabel(count: number): string {
  return count === 1 ? "1 kad menunggu giliran" : `${count} kad menunggu giliran`;
}

function masteredLabel(count: number): string {
  return count === 1 ? "1 kad pengukuhan" : `${count} kad pengukuhan`;
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

interface FahamStats {
  wordBank: number;
  mastered: number;
  learning: number;
  dueToday: number;
  retentionRate7d: number;
  levelProgress?: FahamLevelProgress;
}

export function FahamWorkspace({
  initialQueue,
  initialPreset = "mixed",
  entryContext = null,
  setupMessage = null,
  shouldHydrateInitialQueue = false,
}: FahamWorkspaceProps) {
  const [isConfigExpanded, setIsConfigExpanded] = useState(false);
  const [preset, setPreset] = useState<FahamSourcePreset>(initialPreset);
  const [directionMode, setDirectionMode] = useState<FahamMcqDirectionMode>("arab_to_bm");
  const [isRevision, setIsRevision] = useState(false);
  const [snapshot, setSnapshot] = useState<FahamQueueSnapshot>(initialQueue);
  const [stats, setStats] = useState<FahamStats | null>(null);
  const [prevMastered, setPrevMastered] = useState<number | null>(null);
  const [showCelebration, setShowCelebration] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answerState, setAnswerState] = useState<AnswerState | null>(null);
  const [sessionDoneCount, setSessionDoneCount] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(() => {
    if (typeof window === "undefined") {
      return true;
    }
    return window.localStorage.getItem("miftah:faham:audio-enabled") !== "0";
  });
  const [isPending, startTransition] = useTransition();
  const [isHydratingInitialQueue, setIsHydratingInitialQueue] = useState(
    shouldHydrateInitialQueue,
  );
  const cards = useMemo(() => queueItems(snapshot), [snapshot]);
  const currentCard = cards[currentIndex] ?? null;
  const levelProgress = stats?.levelProgress ?? snapshot.levelProgress;
  const foundUnlockPct = levelProgress.unlockFoundRequired > 0
    ? Math.min(100, (levelProgress.unlockFoundProgress / levelProgress.unlockFoundRequired) * 100)
    : 0;
  const masteredUnlockPct = levelProgress.unlockMasteredRequired > 0
    ? Math.min(100, (levelProgress.unlockMasteredProgress / levelProgress.unlockMasteredRequired) * 100)
    : 0;
  const foundCount = stats?.wordBank ?? 0;
  const foundCap = levelProgress.activeWordLimit;
  const nextCapLabel = levelProgress.nextWordLimit
    ? `${Math.round(levelProgress.nextWordLimit / 1000)}k`
    : "seterusnya";
  const progressPct = cards.length > 0 ? ((currentIndex + 1) / cards.length) * 100 : 0;

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
      setIsHydratingInitialQueue(false);
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
        })
        .catch(() => {
          setErrorMessage("Barisan Faham tak dapat dimuat sekarang.");
        })
        .finally(() => {
          setIsHydratingInitialQueue(false);
        });
    });
  }, [initialPreset, shouldHydrateInitialQueue, startTransition]);

  const moveToNextCard = useCallback(async () => {
    const nextIndex = currentIndex + 1;
    setSessionDoneCount((value) => value + 1);

    if (nextIndex < cards.length) {
      setCurrentIndex(nextIndex);
      setAnswerState(null);
      setErrorMessage(null);
      return;
    }

    const refreshed = await requestQueue(preset, directionMode, isRevision);
    setSnapshot(refreshed);
    setCurrentIndex(0);
    setAnswerState(null);
    setErrorMessage(null);
  }, [cards.length, currentIndex, directionMode, isRevision, preset]);

  const handleAnswer = (selectedIndex: number) => {
    if (!currentCard || answerState || isPending) {
      return;
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

  const playWordAudio = useCallback((text: string, lang: "ar" | "ms", explicitUrl?: string | null) => {
    if (!audioEnabled || !text) return;

    const normalizedExplicitUrl =
      typeof explicitUrl === "string" ? explicitUrl.trim() : "";
    // Quranic Arabic must come from recitation audio; never fallback to TTS.
    const url =
      normalizedExplicitUrl.length > 0
        ? normalizedExplicitUrl
        : lang === "ms"
          ? `/api/audio/tts?text=${encodeURIComponent(text)}&lang=ms&voice=male`
          : null;
    if (!url) return;

    const audio = new Audio(url);
    audio.play().catch(() => {
      // Ignore autoplay blocks or failures
    });
  }, [audioEnabled]);

  const playFeedbackSound = useCallback((kind: "correct" | "incorrect" | "mastered") => {
    if (!audioEnabled) return;
    
    const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    const now = ctx.currentTime;
    
    if (kind === "mastered") {
      // Triumphant arpeggio
      osc.type = "square";
      osc.frequency.setValueAtTime(523.25, now); // C5
      osc.frequency.setValueAtTime(659.25, now + 0.1); // E5
      osc.frequency.setValueAtTime(783.99, now + 0.2); // G5
      osc.frequency.setValueAtTime(1046.5, now + 0.3); // C6
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.8);
      osc.start(now);
      osc.stop(now + 0.8);
    } else if (kind === "correct") {
      // Pleasant bright chime (Major triad)
      osc.type = "sine";
      osc.frequency.setValueAtTime(523.25, now); // C5
      osc.frequency.exponentialRampToValueAtTime(1046.5, now + 0.1); // C6
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
      osc.start(now);
      osc.stop(now + 0.5);
    } else {
      // Subtle corrective low tone
      osc.type = "triangle";
      osc.frequency.setValueAtTime(110.0, now); // A2
      osc.frequency.linearRampToValueAtTime(80.0, now + 0.2);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
      osc.start(now);
      osc.stop(now + 0.3);
    }
  }, [audioEnabled]);

  useEffect(() => {
    void fetch("/api/faham/stats")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && !data.error) {
          const newStats = data as FahamStats;
          if (prevMastered !== null && newStats.mastered > prevMastered) {
            setShowCelebration(true);
            playFeedbackSound("mastered");
            setTimeout(() => setShowCelebration(false), 4000);
          }
          setStats(newStats);
          setPrevMastered(newStats.mastered);
        }
      })
      .catch(console.error);
  }, [playFeedbackSound, prevMastered, sessionDoneCount]);

  // Autoplay prompt when card changes
  useEffect(() => {
    if (currentCard && !answerState) {
      playWordAudio(currentCard.mcq.promptPrimary, currentCard.mcq.promptLang, currentCard.mcq.promptAudioUrl);
    }
  }, [answerState, currentCard, playWordAudio]);

  const handleManualAudio = (lang: "ar" | "ms", text: string, explicitUrl?: string | null) => {
    playWordAudio(text, lang, explicitUrl);
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
      playWordAudio(currentCard.mcq.answerPrimary, lang, currentCard.mcq.answerAudioUrl);

      // Auto-continue to next card after 3 seconds if correct
      if (answerState.isCorrect) {
        const timer = setTimeout(() => {
          handleContinue();
        }, 3000);
        return () => clearTimeout(timer);
      }
    }
  }, [answerState, currentCard, handleContinue, playWordAudio]);

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
              <p className="text-sm font-bold uppercase tracking-widest text-emerald-600 sm:text-base dark:text-emerald-400">Tahniah! +1 Mastered</p>
              <p className="text-base font-bold text-emerald-950 sm:text-lg dark:text-emerald-50">Perkataan Baru Dikuasai</p>
            </div>
          </div>
        </div>
      )}

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

      {currentCard ? (
        <section className="animate-fade-in-up rounded-[2rem] border border-stone-200/90 bg-white/88 p-5 shadow-[0_30px_80px_-52px_rgba(41,37,36,0.65)] backdrop-blur-sm sm:p-7 dark:border-stone-700 dark:bg-stone-900/80">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full border px-3 py-1 text-sm font-medium sm:text-base ${
                  currentCard.kind === "due"
                    ? "border-teal-900/15 bg-teal-950/5 text-teal-900 dark:border-teal-300/20 dark:bg-teal-900/35 dark:text-teal-100"
                    : currentCard.kind === "mastered"
                    ? "border-indigo-900/15 bg-indigo-950/5 text-indigo-900 dark:border-indigo-300/20 dark:bg-indigo-900/35 dark:text-indigo-100"
                    : "border-amber-900/15 bg-amber-100/75 text-amber-900 dark:border-amber-300/20 dark:bg-amber-900/35 dark:text-amber-100"
                }`}
              >
                {currentCard.kind === "due" ? "Ulang kaji" : currentCard.kind === "mastered" ? "Pengukuhan" : "Kad baharu"}
              </span>

              <button
                type="button"
                onClick={handleToggleAudio}
                className={`group flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium transition sm:text-base ${
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

              <span className="rounded-full border border-stone-200 bg-stone-100 px-3 py-1 text-sm text-stone-600 sm:text-base dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300">
                {currentCard.kind === "due"
                  ? dueLabel(snapshot.due.length)
                  : currentCard.kind === "mastered"
                  ? masteredLabel(snapshot.mastered.length)
                  : newLabel(snapshot.new.length)}
              </span>
              <span className="rounded-full border border-stone-200 bg-white px-3 py-1 text-sm text-stone-600 sm:text-base dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300">
                Susunan: {FAHAM_PRESET_CONFIGS[preset].shortLabel}
              </span>
              <span className="rounded-full border border-stone-200 bg-white px-3 py-1 text-sm text-stone-600 sm:text-base dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300">
                Arah: {DIRECTION_CONFIGS[directionMode].shortLabel}
              </span>
              {currentCard.needsReinforcement ? (
                <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-sm text-rose-700 sm:text-base dark:border-rose-700/40 dark:bg-rose-950/30 dark:text-rose-200">
                  Pengukuhan {currentCard.mistakeStreak}
                </span>
              ) : null}
            </div>

            <div className="min-w-32">
              <div className="flex items-center justify-between text-sm text-stone-500 sm:text-base dark:text-stone-400">
                <span>
                  {currentIndex + 1} / {cards.length}
                </span>
                <span>{Math.round(progressPct)}%</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-800">
                <div
                  className="h-full rounded-full bg-[linear-gradient(90deg,#b45309,#0f766e)] transition-[width] duration-300 dark:bg-[linear-gradient(90deg,#f59e0b,#14b8a6)]"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          </div>

          <div className="mt-8 grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="rounded-[1.75rem] border border-amber-200/70 bg-[radial-gradient(circle_at_top,rgba(251,191,36,0.14),transparent_55%),linear-gradient(180deg,rgba(255,251,235,0.92),rgba(255,255,255,0.96))] p-6 dark:border-amber-500/20 dark:bg-[radial-gradient(circle_at_top,rgba(245,158,11,0.18),transparent_55%),linear-gradient(180deg,rgba(41,37,36,0.92),rgba(12,10,9,0.96))]">
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
              {currentCard.mcq.promptSecondary ? (
                <p className="mt-4 text-center text-base tracking-[0.08em] text-stone-500 dark:text-stone-400">
                  {currentCard.mcq.promptSecondary}
                </p>
              ) : null}
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
              className={`mt-6 rounded-[1.5rem] border p-5 ${
                answerState.isCorrect
                  ? "border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-700/40 dark:bg-emerald-950/30 dark:text-emerald-50"
                  : "border-rose-200 bg-rose-50 text-rose-950 dark:border-rose-700/40 dark:bg-rose-950/30 dark:text-rose-50"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p
                    className={`text-base font-semibold sm:text-lg ${
                      answerState.isCorrect
                        ? "text-emerald-800 dark:text-emerald-100"
                        : "text-rose-800 dark:text-rose-100"
                    }`}
                  >
                    {answerState.isCorrect
                      ? "Betul. Kad ini akan dijarakkan."
                      : "Kurang tepat. Perkataan ini ditanda untuk pengukuhan."}
                  </p>
                  
                  {!answerState.isCorrect && (
                    <div className="mt-4 rounded-xl border border-rose-200/50 bg-white/40 p-3 dark:border-rose-800/30 dark:bg-black/20">
                      <p className="text-sm font-bold uppercase tracking-widest text-rose-600 sm:text-base dark:text-rose-400">
                        Nota Pembelajaran
                      </p>
                      <div className="mt-2 text-base leading-relaxed text-stone-800 dark:text-stone-100">
                        Perkataan <span className="font-arabic text-xl">{currentCard.word.textUthmani}</span> bermaksud <span className="font-bold text-emerald-700 dark:text-emerald-400">{currentCard.word.translationBm}</span>.
                        {currentCard.word.transliteration && (
                          <div className="mt-1 text-sm text-stone-500 dark:text-stone-400">
                            Sebutan: {currentCard.word.transliteration}
                          </div>
                        )}
                        <p className="mt-2 text-sm opacity-75">
                          Tips: Fokus pada hubungan bunyi dan makna sebelum menukar kad.
                        </p>
                      </div>
                    </div>
                  )}

                  <p className="mt-3 text-base text-stone-800 dark:text-stone-100">
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
                          : "font-medium decoration-stone-400/30 underline-offset-4 hover:underline"
                      }`}
                      title="Tekan untuk dengar semula"
                    >
                      {currentCard.mcq.answerPrimary}
                    </span>
                  </p>
                  {currentCard.mcq.answerSecondary ? (
                    <p className="mt-1 text-base text-stone-700 dark:text-stone-200">
                      {currentCard.mcq.direction === "bm_to_arab"
                        ? `Transliterasi: ${currentCard.mcq.answerSecondary}`
                        : `Bahasa Inggeris: ${currentCard.mcq.answerSecondary}`}
                    </p>
                  ) : null}
                  {!answerState.isCorrect ? (
                    <p className="mt-1 text-base text-rose-800 dark:text-rose-100">
                      Tag pengukuhan ini akan kekal sehingga anda menjawabnya
                      dengan betul.
                    </p>
                  ) : null}

                  {currentCard.sourceContext?.primaryReference ||
                  (currentCard.sourceContext?.sources.length ?? 0) > 0 ? (
                    <div className="mt-4 rounded-2xl border border-stone-200/70 bg-white/70 p-4 dark:border-stone-700/60 dark:bg-stone-950/40">
                      <p className="text-sm font-bold uppercase tracking-[0.2em] text-stone-500 dark:text-stone-400">
                        Jejak semula dalam Quran
                      </p>

                      {currentCard.sourceContext?.primaryReference ? (
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          {currentCard.sourceContext.primaryReference.href ? (
                            <Link
                              href={currentCard.sourceContext.primaryReference.href}
                              className="rounded-full border border-stone-300 bg-stone-100 px-3 py-1 text-sm font-medium text-stone-800 transition hover:bg-stone-200 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100 dark:hover:bg-stone-800"
                            >
                              Ayat {currentCard.sourceContext.primaryReference.label}
                            </Link>
                          ) : (
                            <span className="rounded-full border border-stone-300 bg-stone-100 px-3 py-1 text-sm font-medium text-stone-800 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100">
                              Ayat {currentCard.sourceContext.primaryReference.label}
                            </span>
                          )}
                          {currentCard.sourceContext.primaryReference.pageNumber ? (
                            <span className="text-sm text-stone-600 dark:text-stone-300">
                              Halaman {currentCard.sourceContext.primaryReference.pageNumber}
                            </span>
                          ) : null}
                        </div>
                      ) : null}

                      {(currentCard.sourceContext?.sources.length ?? 0) > 0 ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {currentCard.sourceContext?.sources.map((source) => (
                            <Link
                              key={`${currentCard.progressId}-${source.type}-${source.href}`}
                              href={source.href}
                              className="rounded-full border border-amber-300/70 bg-amber-50 px-3 py-1 text-sm font-medium text-amber-900 transition hover:bg-amber-100 dark:border-amber-500/40 dark:bg-amber-950/30 dark:text-amber-100 dark:hover:bg-amber-900/45"
                              title={source.detail}
                            >
                              {source.label}
                            </Link>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <button
                  type="button"
                  disabled={isPending}
                  onClick={handleContinue}
                  className="rounded-xl bg-stone-900 px-5 py-2.5 text-base font-medium text-stone-50 transition hover:bg-stone-800 disabled:opacity-50 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-300"
                >
                  {isPending ? "Menyimpan..." : "Kad seterusnya"}
                </button>
              </div>

              {currentCard.exposure ? (
                <div className="mt-4 flex flex-wrap gap-2 text-sm text-stone-600 sm:text-base dark:text-stone-300">
                  <span className="rounded-full border border-stone-200 bg-white px-3 py-1 dark:border-stone-700 dark:bg-stone-900">
                    {currentCard.exposure.exposureEventCount} pendedahan
                  </span>
                  <span className="rounded-full border border-stone-200 bg-white px-3 py-1 dark:border-stone-700 dark:bg-stone-900">
                    {currentCard.exposure.distinctContextCount} konteks
                  </span>
                  {currentCard.exposure.readingOccurrenceWeight > 0 ? (
                    <span className="rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-teal-800 dark:border-teal-700/40 dark:bg-teal-900/20 dark:text-teal-200">
                      Baca {currentCard.exposure.readingOccurrenceWeight}
                    </span>
                  ) : null}
                  {currentCard.exposure.themeOccurrenceWeight > 0 ? (
                    <span className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-indigo-800 dark:border-indigo-700/40 dark:bg-indigo-900/20 dark:text-indigo-200">
                      Tema {currentCard.exposure.themeOccurrenceWeight}
                    </span>
                  ) : null}
                  {currentCard.exposure.hifzOccurrenceWeight > 0 ? (
                    <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-amber-800 dark:border-amber-700/40 dark:bg-amber-900/20 dark:text-amber-200">
                      Hafal {currentCard.exposure.hifzOccurrenceWeight}
                    </span>
                  ) : null}
                </div>
              ) : null}
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
      ) : (
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

      <section className="rounded-[2rem] border border-stone-200/85 bg-white/85 p-5 shadow-[0_30px_80px_-52px_rgba(41,37,36,0.4)] backdrop-blur-sm sm:p-7 dark:border-stone-700 dark:bg-stone-900/78">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex items-center rounded-full border border-stone-200 bg-stone-100/70 px-3 py-1 text-sm font-bold tracking-[0.18em] text-stone-500 uppercase dark:border-stone-700 dark:bg-stone-800/40 dark:text-stone-400">
                Sesi ini
              </div>
              <h1 className="mt-3 text-3xl font-medium tracking-tight text-stone-900 sm:text-4xl dark:text-stone-50">
                Jawab dahulu, ubah tetapan hanya bila perlu.
              </h1>
              <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-stone-600 sm:text-base dark:text-stone-300">
                Kad ulang kaji datang daripada jawapan lepas yang sudah due. Kad menunggu giliran ialah kad yang masih dalam fasa belajar tetapi belum sampai masanya. Kad baharu pula dibuka daripada perkataan yang anda sudah jumpa semasa Baca, Tema, atau Hafal. Found menunjukkan berapa banyak perkataan dalam cap aktif yang anda telah temui setakat ini.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setIsConfigExpanded(!isConfigExpanded)}
                className={`flex items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-semibold transition shadow-sm sm:text-base ${
                  isConfigExpanded
                    ? "border-amber-300 bg-amber-100 text-amber-950 dark:border-amber-500/30 dark:bg-amber-900/50"
                    : "border-stone-200 bg-white text-stone-600 hover:border-stone-300 hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300 dark:hover:bg-stone-800"
                }`}
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
                {isConfigExpanded ? "Tutup Pilihan Lanjutan" : "Buka Pilihan Lanjutan"}
              </button>

              <button
                onClick={() => reloadQueue(preset, directionMode, !isRevision)}
                disabled={isPending}
                className={`flex items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-semibold transition shadow-sm sm:text-base ${
                  isRevision
                    ? "border-emerald-300 bg-emerald-100 text-emerald-950 dark:border-emerald-500/30 dark:bg-emerald-900/50"
                    : "border-stone-200 bg-white text-stone-600 hover:border-stone-300 hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300 dark:hover:bg-stone-800"
                }`}
              >
                <svg
                  className={`h-3.5 w-3.5 ${isPending ? "animate-spin" : isRevision ? "animate-pulse" : ""}`}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {isRevision ? "Ulang Kaji Aktif" : "Mula Ulang Kaji"}
              </button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-teal-200/70 bg-teal-50/70 p-4 dark:border-teal-700/40 dark:bg-teal-950/20">
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-teal-800 dark:text-teal-300">
                Ulang kaji
              </p>
              <p className="mt-2 text-3xl font-semibold tracking-tight text-teal-950 dark:text-teal-50">
                {snapshot.due.length}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-teal-900/80 dark:text-teal-100/80">
                Kad yang pernah dijawab dan sudah sampai masa untuk disemak semula.
              </p>
            </div>

            <div className="rounded-2xl border border-sky-200/70 bg-sky-50/70 p-4 dark:border-sky-700/40 dark:bg-sky-950/20">
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-sky-800 dark:text-sky-300">
                Menunggu giliran
              </p>
              <p className="mt-2 text-3xl font-semibold tracking-tight text-sky-950 dark:text-sky-50">
                {snapshot.learning.length}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-sky-900/80 dark:text-sky-100/80">
                Kad yang masih belajar, tetapi belum due untuk sesi ini.
              </p>
            </div>

            <div className="rounded-2xl border border-amber-200/70 bg-amber-50/70 p-4 dark:border-amber-700/40 dark:bg-amber-950/20">
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-amber-800 dark:text-amber-300">
                Kad baharu
              </p>
              <p className="mt-2 text-3xl font-semibold tracking-tight text-amber-950 dark:text-amber-50">
                {snapshot.new.length}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-amber-900/80 dark:text-amber-100/80">
                Perkataan yang baru terbuka hasil pendedahan daripada baca, tema, atau hafal.
              </p>
            </div>

            <div className="rounded-2xl border border-indigo-200/70 bg-indigo-50/70 p-4 dark:border-indigo-700/40 dark:bg-indigo-950/20">
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-indigo-800 dark:text-indigo-300">
                Pengukuhan
              </p>
              <p className="mt-2 text-3xl font-semibold tracking-tight text-indigo-950 dark:text-indigo-50">
                {snapshot.mastered.length}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-indigo-900/80 dark:text-indigo-100/80">
                Kad mahir yang diselitkan sekali-sekala supaya sambungan dengan ayat asal kekal segar.
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-amber-200/80 bg-amber-50/70 p-4 dark:border-amber-500/30 dark:bg-amber-950/20">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-amber-300 bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-900 dark:border-amber-500/50 dark:bg-amber-900/40 dark:text-amber-100">
                L{levelProgress.activeLevel}
              </span>
              <span className="text-sm text-stone-700 dark:text-stone-200">
                Found {foundCount} / {foundCap}
              </span>
              <span className="text-sm text-stone-700 dark:text-stone-200">
                {learningLabel(snapshot.learning.length)}
              </span>
              <span className="text-sm text-stone-700 dark:text-stone-200">
                {stats?.dueToday ?? snapshot.due.length} due hari ini
              </span>
            </div>

            {levelProgress.isMaxLevel ? (
              <p className="mt-2 text-sm text-emerald-700 dark:text-emerald-300">
                Tahap maksimum telah dibuka. Teruskan naikkan Mahir.
              </p>
            ) : (
              <div className="mt-3 space-y-2">
                <p className="text-sm text-stone-700 dark:text-stone-200">
                  L{levelProgress.nextLevel} akan buka cap ke {nextCapLabel} perkataan.
                </p>
                <div>
                  <div className="flex items-center justify-between text-xs text-stone-600 dark:text-stone-300">
                    <span>Ditemui</span>
                    <span>{Math.round(foundUnlockPct)}%</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-amber-100 dark:bg-amber-900/30">
                    <div className="h-full rounded-full bg-amber-500" style={{ width: `${foundUnlockPct}%` }} />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between text-xs text-stone-600 dark:text-stone-300">
                    <span>Mahir</span>
                    <span>{Math.round(masteredUnlockPct)}%</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: `${masteredUnlockPct}%` }} />
                  </div>
                </div>
              </div>
            )}
          </div>

          {isConfigExpanded ? (
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <StatCard
                  label="Found"
                  value={`${foundCount} / ${foundCap}`}
                  highlight
                  helper="Perkataan ditemui"
                  progress={foundCap > 0 ? foundCount / foundCap : 0}
                  progressLabel={`${Math.floor(foundCap > 0 ? (foundCount / foundCap) * 100 : 0)}% sasaran`}
                />
                <StatCard
                  label="Mahir"
                  value={`${stats?.mastered ?? 0} / ${foundCount}`}
                  helper="Mastered / Found"
                />
                <StatCard
                  label="Learning"
                  value={String(stats?.learning ?? 0)}
                  helper="Sedang Belajar"
                />
                <StatCard
                  label="Due Today"
                  value={String(stats?.dueToday ?? 0)}
                  helper="Ulang kaji"
                />
                <StatCard
                  label="7-Day Retention"
                  value={
                    stats && Number.isFinite(stats.retentionRate7d)
                      ? `${(stats.retentionRate7d * 100).toFixed(0)}%`
                      : "0%"
                  }
                  helper="Kadar Ingatan"
                />
              </div>

              <aside className="animate-in fade-in slide-in-from-top-2 duration-300 rounded-[1.75rem] border border-stone-200/80 bg-white/80 p-5 shadow-xl backdrop-blur-md dark:border-stone-700 dark:bg-stone-950/60">
                <div className="grid gap-8 lg:grid-cols-2">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-bold uppercase tracking-[0.22em] text-stone-500 sm:text-base dark:text-stone-400">
                        Susun deck sesi ini
                      </p>
                      <span className="rounded-full border border-stone-200 bg-white px-3 py-1 text-sm font-bold text-stone-600 sm:text-base dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300">
                        {FAHAM_PRESET_CONFIGS[preset].shortLabel}
                      </span>
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
                                : "border-stone-200 bg-white text-stone-700 hover:bg-stone-100 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300 dark:hover:bg-stone-800"
                            }`}
                          >
                            {FAHAM_PRESET_CONFIGS[key].label}
                          </button>
                        );
                      })}
                    </div>
                    <div className="rounded-xl border border-stone-200/80 bg-white/60 p-3 text-sm leading-relaxed text-stone-600 sm:text-base dark:border-stone-700 dark:bg-stone-900/50 dark:text-stone-400">
                      {FAHAM_PRESET_CONFIGS[preset].helper}
                    </div>
                  </div>

                  <div className="space-y-4 border-t border-stone-200/80 pt-6 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0 dark:border-stone-700">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-bold uppercase tracking-[0.22em] text-stone-500 sm:text-base dark:text-stone-400">
                        Arah soalan
                      </p>
                      <span className="rounded-full border border-stone-200 bg-white px-3 py-1 text-sm font-bold text-stone-600 sm:text-base dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300">
                        {DIRECTION_CONFIGS[directionMode].shortLabel}
                      </span>
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
                                : "border-stone-200 bg-white text-stone-700 hover:bg-stone-100 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300 dark:hover:bg-stone-800"
                            }`}
                          >
                            <div className="text-sm font-bold sm:text-base">{DIRECTION_CONFIGS[key].label}</div>
                            <div className="mt-0.5 text-sm leading-tight text-stone-500 sm:text-base dark:text-stone-400">
                              {DIRECTION_CONFIGS[key].helper}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </aside>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function StatCard({ 
  label, 
  value, 
  helper,
  highlight = false,
  progress,
  progressLabel
}: { 
  label: string; 
  value: string; 
  helper?: string;
  highlight?: boolean;
  progress?: number;
  progressLabel?: string;
}) {
  if (highlight) {
    return (
      <div className={`relative overflow-hidden rounded-2xl border border-emerald-300/60 bg-gradient-to-br from-emerald-50 to-white px-4 py-3 shadow-[0_8px_30px_-12px_rgba(16,185,129,0.25)] transition-all duration-500 dark:border-emerald-500/30 dark:from-emerald-950/40 dark:to-stone-900/40 ${progressLabel?.includes('100') ? 'animate-pulse' : ''}`}>
        <div className="absolute -right-1 -top-1 opacity-[0.08] dark:opacity-[0.15]">
          <svg className="h-16 w-16 text-emerald-600 dark:text-emerald-400" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
        </div>
        
        <p className="text-sm font-bold uppercase tracking-[0.25em] text-emerald-800 sm:text-base dark:text-emerald-400/90">
          {label}
        </p>
        
        <div className="mt-1 flex items-baseline gap-1">
          <p className="text-4xl font-extrabold tracking-tight text-emerald-950 dark:text-emerald-50">
            {value}
          </p>
        </div>

        {progress !== undefined && (
          <div className="mt-3">
            <div className="flex items-center justify-between text-sm font-semibold text-emerald-700 sm:text-base dark:text-emerald-400">
              <span>Progress</span>
              <span>{progressLabel}</span>
            </div>
            <div className="mt-1.5 h-1.5 w-full rounded-full bg-emerald-200/50 dark:bg-emerald-900/30">
              <div 
                className="h-full rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] transition-[width] duration-1000 dark:bg-emerald-400" 
                style={{ width: `${Math.min(100, progress * 100)}%` }}
              />
            </div>
          </div>
        )}

        {!progress && helper && (
          <p className="mt-1 text-sm font-medium text-emerald-600 sm:text-base dark:text-emerald-500">
            {helper}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-stone-200/80 bg-stone-50/90 px-4 py-3 dark:border-stone-700 dark:bg-stone-950/60">
      <p className="text-sm font-bold uppercase tracking-[0.2em] text-stone-500 sm:text-base dark:text-stone-400">
        {label}
      </p>
      <p className="mt-1 text-3xl font-semibold tracking-tight text-stone-900 dark:text-stone-100">
        {value}
      </p>
      {helper && (
        <p className="mt-1 text-sm text-stone-400 sm:text-base dark:text-stone-500">
          {helper}
        </p>
      )}
    </div>
  );
}
