"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import type { FahamSourceType } from "@/types/database";
import type { FahamQueueSnapshot, SerializedFahamCard } from "@/lib/faham/queue";
import type { FahamMcqDirectionMode } from "@/lib/faham/mcq";

type SourcePreset = "mixed" | "reading" | "theme" | "hifz";

interface FahamWorkspaceProps {
  initialQueue: FahamQueueSnapshot;
  setupMessage?: string | null;
}

interface AnswerState {
  isCorrect: boolean;
  selectedIndex: number;
}

const PRESET_CONFIGS: Record<
  SourcePreset,
  {
    helper: string;
    label: string;
    preferredSources: FahamSourceType[];
    shortLabel: string;
  }
> = {
  hifz: {
    helper: "Susun kad baru supaya yang paling rapat dengan ayat hafalan aktif datang dahulu.",
    label: "Hafal dahulu",
    preferredSources: ["hifz_ayah", "reading_page", "theme_chunk"],
    shortLabel: "Hafal",
  },
  mixed: {
    helper: "Campur semua feeder supaya deck kekal seimbang antara baca, tema, dan hafal.",
    label: "Campuran seimbang",
    preferredSources: ["reading_page", "theme_chunk", "hifz_ayah"],
    shortLabel: "Campur",
  },
  reading: {
    helper: "Tolak ke depan perkataan yang baru anda jumpa ketika membaca halaman.",
    label: "Baca dahulu",
    preferredSources: ["reading_page", "theme_chunk", "hifz_ayah"],
    shortLabel: "Baca",
  },
  theme: {
    helper: "Utamakan perkataan yang kuat berulang dalam tema yang sedang diteroka.",
    label: "Tema dahulu",
    preferredSources: ["theme_chunk", "reading_page", "hifz_ayah"],
    shortLabel: "Tema",
  },
};

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
  return [...snapshot.due, ...snapshot.new];
}

function dueLabel(count: number): string {
  return count === 1 ? "1 kad ulang kaji" : `${count} kad ulang kaji`;
}

function newLabel(count: number): string {
  return count === 1 ? "1 kad baharu" : `${count} kad baharu`;
}

async function requestQueue(
  preset: SourcePreset,
  directionMode: FahamMcqDirectionMode,
): Promise<FahamQueueSnapshot> {
  const response = await fetch("/api/faham/queue", {
    body: JSON.stringify({
      directionMode,
      preferredSources: PRESET_CONFIGS[preset].preferredSources,
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

export function FahamWorkspace({
  initialQueue,
  setupMessage = null,
}: FahamWorkspaceProps) {
  const [preset, setPreset] = useState<SourcePreset>("mixed");
  const [directionMode, setDirectionMode] = useState<FahamMcqDirectionMode>("arab_to_bm");
  const [snapshot, setSnapshot] = useState<FahamQueueSnapshot>(initialQueue);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answerState, setAnswerState] = useState<AnswerState | null>(null);
  const [sessionDoneCount, setSessionDoneCount] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const cards = useMemo(() => queueItems(snapshot), [snapshot]);
  const currentCard = cards[currentIndex] ?? null;
  const progressPct = cards.length > 0 ? ((currentIndex + 1) / cards.length) * 100 : 0;

  const reloadQueue = (
    nextPreset: SourcePreset,
    nextDirectionMode: FahamMcqDirectionMode,
  ) => {
    startTransition(() => {
      void requestQueue(nextPreset, nextDirectionMode)
        .then((nextSnapshot) => {
          setPreset(nextPreset);
          setDirectionMode(nextDirectionMode);
          setSnapshot(nextSnapshot);
          setCurrentIndex(0);
          setAnswerState(null);
          setErrorMessage(null);
        })
        .catch(() => {
          setErrorMessage("Barisan Faham tak dapat dimuat sekarang.");
        });
    });
  };

  const moveToNextCard = async () => {
    const nextIndex = currentIndex + 1;
    setSessionDoneCount((value) => value + 1);

    if (nextIndex < cards.length) {
      setCurrentIndex(nextIndex);
      setAnswerState(null);
      setErrorMessage(null);
      return;
    }

    const refreshed = await requestQueue(preset, directionMode);
    setSnapshot(refreshed);
    setCurrentIndex(0);
    setAnswerState(null);
    setErrorMessage(null);
  };

  const handleAnswer = (selectedIndex: number) => {
    if (!currentCard || answerState || isPending) {
      return;
    }

    setAnswerState({
      isCorrect: selectedIndex === currentCard.mcq.correctIndex,
      selectedIndex,
    });
  };

  const handleContinue = () => {
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
  };

  return (
    <div className="flex flex-col gap-6">
      <section className="animate-fade-in-up rounded-[2rem] border border-stone-200/85 bg-white/85 p-5 shadow-[0_30px_80px_-52px_rgba(41,37,36,0.65)] backdrop-blur-sm sm:p-7 dark:border-stone-700 dark:bg-stone-900/78 dark:shadow-[0_30px_80px_-52px_rgba(2,6,23,0.95)]">
        <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-5">
            <div className="inline-flex items-center rounded-full border border-amber-900/15 bg-amber-100/80 px-3 py-1 text-xs font-medium tracking-wide text-amber-950 dark:border-amber-300/20 dark:bg-amber-900/35 dark:text-amber-100">
              Faham Engine · MCQ dua arah
            </div>

            <div>
              <h1 className="text-3xl font-medium tracking-tight text-stone-900 sm:text-4xl dark:text-stone-50">
                Fahami makna tanpa membuka jawapan terlebih dahulu.
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-stone-600 dark:text-stone-300">
                Faham kini menyokong Arab ke Melayu, Melayu ke Arab, atau mod
                campuran. Enjin ini memfokuskan 3,000 perkataan teras. Jika
                tersalah jawab, perkataan itu akan ditanda untuk pengukuhan dan
                muncul semula lebih awal.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Perkataan teras"
                value={String(snapshot.stats.focusWordLimit)}
              />
              <StatCard
                label="Kad ulang kaji"
                value={String(snapshot.stats.dueCount)}
              />
              <StatCard
                label="Kad baharu sedia"
                value={String(snapshot.stats.eligibleNewCount)}
              />
              <StatCard label="Siap sesi ini" value={String(sessionDoneCount)} />
            </div>
          </div>

          <aside className="rounded-[1.75rem] border border-stone-200/80 bg-stone-50/90 p-4 dark:border-stone-700 dark:bg-stone-950/60">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-stone-500 dark:text-stone-400">
                  Susun deck sesi ini
                </p>
                <p className="mt-2 text-sm leading-relaxed text-stone-600 dark:text-stone-300">
                  Hanya ubah keutamaan kad baru untuk sesi semasa. Ia tidak
                  menyimpan tetapan kekal, dan kad ulang kaji tetap datang
                  dahulu.
                </p>
              </div>
              <span className="rounded-full border border-stone-200 bg-white px-3 py-1 text-xs font-medium text-stone-600 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300">
                {PRESET_CONFIGS[preset].shortLabel}
              </span>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              {(Object.keys(PRESET_CONFIGS) as SourcePreset[]).map((key) => {
                const active = preset === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => reloadQueue(key, directionMode)}
                    disabled={isPending}
                    className={`rounded-2xl border px-4 py-3 text-left text-sm font-medium transition ${
                      active
                        ? "border-amber-300 bg-amber-100 text-amber-950 dark:border-amber-500/50 dark:bg-amber-900/30 dark:text-amber-100"
                        : "border-stone-200 bg-white/90 text-stone-700 hover:bg-white dark:border-stone-700 dark:bg-stone-900/70 dark:text-stone-200 dark:hover:bg-stone-900"
                    }`}
                  >
                    {PRESET_CONFIGS[key].label}
                  </button>
                );
              })}
            </div>

            <div className="mt-4 rounded-2xl border border-stone-200/80 bg-white/80 p-4 text-sm leading-relaxed text-stone-600 dark:border-stone-700 dark:bg-stone-900/70 dark:text-stone-300">
              {PRESET_CONFIGS[preset].helper}
            </div>

            <div className="mt-4 border-t border-stone-200/80 pt-4 dark:border-stone-700">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-stone-500 dark:text-stone-400">
                    Arah soalan
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-stone-600 dark:text-stone-300">
                    Tukar bentuk recall untuk sesi ini sahaja.
                  </p>
                </div>
                <span className="rounded-full border border-stone-200 bg-white px-3 py-1 text-xs font-medium text-stone-600 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300">
                  {DIRECTION_CONFIGS[directionMode].shortLabel}
                </span>
              </div>

              <div className="mt-4 grid gap-2">
                {(Object.keys(DIRECTION_CONFIGS) as FahamMcqDirectionMode[]).map((key) => {
                  const active = directionMode === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => reloadQueue(preset, key)}
                      disabled={isPending}
                      className={`rounded-2xl border px-4 py-3 text-left transition ${
                        active
                          ? "border-teal-300 bg-teal-50 text-teal-950 dark:border-teal-500/50 dark:bg-teal-950/30 dark:text-teal-100"
                          : "border-stone-200 bg-white/90 text-stone-700 hover:bg-white dark:border-stone-700 dark:bg-stone-900/70 dark:text-stone-200 dark:hover:bg-stone-900"
                      }`}
                    >
                      <div className="text-sm font-medium">{DIRECTION_CONFIGS[key].label}</div>
                      <div className="mt-1 text-xs text-stone-500 dark:text-stone-400">
                        {DIRECTION_CONFIGS[key].helper}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </aside>
        </div>
      </section>

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

      {snapshot.blockedReason === "due_backlog" ? (
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
                className={`rounded-full border px-3 py-1 text-xs font-medium ${
                  currentCard.kind === "due"
                    ? "border-teal-900/15 bg-teal-950/5 text-teal-900 dark:border-teal-300/20 dark:bg-teal-900/35 dark:text-teal-100"
                    : "border-amber-900/15 bg-amber-100/75 text-amber-900 dark:border-amber-300/20 dark:bg-amber-900/35 dark:text-amber-100"
                }`}
              >
                {currentCard.kind === "due" ? "Ulang kaji" : "Kad baharu"}
              </span>
              <span className="rounded-full border border-stone-200 bg-stone-100 px-3 py-1 text-xs text-stone-600 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300">
                {currentCard.kind === "due"
                  ? dueLabel(snapshot.due.length)
                  : newLabel(snapshot.new.length)}
              </span>
              <span className="rounded-full border border-stone-200 bg-white px-3 py-1 text-xs text-stone-600 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300">
                Susunan: {PRESET_CONFIGS[preset].shortLabel}
              </span>
              <span className="rounded-full border border-stone-200 bg-white px-3 py-1 text-xs text-stone-600 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300">
                Arah: {DIRECTION_CONFIGS[directionMode].shortLabel}
              </span>
              {currentCard.needsReinforcement ? (
                <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs text-rose-700 dark:border-rose-700/40 dark:bg-rose-950/30 dark:text-rose-200">
                  Pengukuhan {currentCard.mistakeStreak}
                </span>
              ) : null}
            </div>

            <div className="min-w-32">
              <div className="flex items-center justify-between text-xs text-stone-500 dark:text-stone-400">
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
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500 dark:text-stone-400">
                {currentCard.mcq.promptLabel}
              </p>
              <p className="mt-3 text-sm leading-relaxed text-stone-600 dark:text-stone-300">
                {currentCard.mcq.promptHint}
              </p>
              <p
                dir={currentCard.mcq.promptDir}
                lang={currentCard.mcq.promptLang}
                className={`mt-10 text-center leading-tight text-stone-950 sm:text-6xl dark:text-stone-50 ${
                  currentCard.mcq.promptLang === "ar"
                    ? "font-arabic text-5xl"
                    : "text-4xl font-semibold"
                }`}
              >
                {currentCard.mcq.promptPrimary}
              </p>
              {currentCard.mcq.promptSecondary ? (
                <p className="mt-4 text-center text-sm tracking-[0.08em] text-stone-500 dark:text-stone-400">
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
                    })}`}
                  >
                    <span className="flex items-start gap-3">
                      <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-current/15 bg-white/70 text-xs font-semibold dark:bg-white/10">
                        {label}
                      </span>
                      <span
                        dir={option.dir}
                        lang={option.lang}
                        className={`leading-relaxed ${
                          option.lang === "ar"
                            ? "font-arabic text-2xl"
                            : "text-sm font-medium"
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

          <div className="mt-5 rounded-[1.35rem] border border-stone-200/80 bg-stone-50/90 p-4 dark:border-stone-700 dark:bg-stone-950/60">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-stone-500 dark:text-stone-400">
              Set pilihan ini
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {currentCard.mcq.whyThisSet.map((note) => (
                <span
                  key={note}
                  className="rounded-full border border-stone-200 bg-white px-3 py-1 text-xs leading-relaxed text-stone-600 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300"
                >
                  {note}
                </span>
              ))}
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
                    className={`text-sm font-semibold ${
                      answerState.isCorrect
                        ? "text-emerald-800 dark:text-emerald-100"
                        : "text-rose-800 dark:text-rose-100"
                    }`}
                  >
                    {answerState.isCorrect
                      ? "Betul. Kad ini akan dijarakkan."
                      : "Kurang tepat. Perkataan ini ditanda untuk pengukuhan dan akan muncul semula lebih awal."}
                  </p>
                  <p className="mt-2 text-sm text-stone-800 dark:text-stone-100">
                    {currentCard.mcq.answerLabel}:{" "}
                    <span
                      dir={currentCard.mcq.direction === "bm_to_arab" ? "rtl" : "ltr"}
                      lang={currentCard.mcq.direction === "bm_to_arab" ? "ar" : "ms"}
                      className={`${
                        currentCard.mcq.direction === "bm_to_arab"
                          ? "font-arabic text-2xl"
                          : "font-medium"
                      }`}
                    >
                      {currentCard.mcq.answerPrimary}
                    </span>
                  </p>
                  {currentCard.mcq.answerSecondary ? (
                    <p className="mt-1 text-sm text-stone-700 dark:text-stone-200">
                      {currentCard.mcq.direction === "bm_to_arab"
                        ? `Transliterasi: ${currentCard.mcq.answerSecondary}`
                        : `Bahasa Inggeris: ${currentCard.mcq.answerSecondary}`}
                    </p>
                  ) : null}
                  {!answerState.isCorrect ? (
                    <p className="mt-1 text-sm text-rose-800 dark:text-rose-100">
                      Tag pengukuhan ini akan kekal sehingga anda menjawabnya
                      dengan betul.
                    </p>
                  ) : null}
                </div>

                <button
                  type="button"
                  disabled={isPending}
                  onClick={handleContinue}
                  className="rounded-xl bg-stone-900 px-5 py-2.5 text-sm font-medium text-stone-50 transition hover:bg-stone-800 disabled:opacity-50 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-300"
                >
                  {isPending ? "Menyimpan..." : "Kad seterusnya"}
                </button>
              </div>

              {currentCard.exposure ? (
                <div className="mt-4 flex flex-wrap gap-2 text-xs text-stone-600 dark:text-stone-300">
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
      ) : (
        <section className="animate-fade-in-up rounded-3xl border border-stone-200/90 bg-white/88 p-8 text-center shadow-[0_25px_70px_-48px_rgba(28,25,23,0.55)] backdrop-blur-sm dark:border-stone-700 dark:bg-stone-900/80">
          <p className="text-2xl font-medium text-stone-900 dark:text-stone-100">
            Belum ada kad Faham buat masa ini.
          </p>
          <p className="mt-2 text-sm text-stone-600 dark:text-stone-300">
            Teruskan membaca atau buka tema dahulu supaya enjin ini mempunyai
            pendedahan yang cukup untuk membuka kad baharu.
          </p>
        </section>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-stone-200/80 bg-stone-50/90 px-4 py-3 dark:border-stone-700 dark:bg-stone-950/60">
      <p className="text-xs uppercase tracking-[0.2em] text-stone-500 dark:text-stone-400">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-stone-900 dark:text-stone-100">
        {value}
      </p>
    </div>
  );
}
