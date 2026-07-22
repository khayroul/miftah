"use client";

import { useTranslations } from "next-intl";
import type { TebukPrompt } from "../../domain/types";
import type { UnveilState } from "../../domain/progressive-unveil";
import { TebukPromptCard } from "./TebukPromptCard";

export function HifzSessionErrorOverlay({
  error,
  onExit,
}: {
  error: string;
  onExit: () => void;
}) {
  const t = useTranslations("hifz.sessionOverlays");
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-stone-900/80 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-8 text-center shadow-sm dark:border-stone-700 dark:bg-stone-900">
        <p className="text-sm font-semibold text-rose-600 dark:text-rose-400">
          {t("micErrorTitle")}
        </p>
        <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">{error}</p>
        <button type="button" onClick={onExit} className="mt-6 w-full rounded-xl bg-stone-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-stone-700">
          {t("exit")}
        </button>
      </div>
    </div>
  );
}

export function TebukActivePanel({
  currentPrompt,
  isPromptRevealed,
  onExit,
  onFinish,
  onReplay,
  pageNumber,
  phase,
  roundNumber,
  totalRounds,
}: {
  currentPrompt: TebukPrompt;
  isPromptRevealed: boolean;
  onExit: () => void;
  onFinish: () => void;
  onReplay: () => void;
  pageNumber: number;
  phase: "prompt" | "playing" | "reciting";
  roundNumber: number;
  totalRounds: number;
}) {
  const t = useTranslations("hifz.tebuk");
  const tOverlays = useTranslations("hifz.sessionOverlays");
  return (
    <div className="flex flex-col gap-3">
      <TebukPromptCard
        prompt={currentPrompt}
        pageNumber={pageNumber}
        roundNumber={roundNumber}
        totalRounds={totalRounds}
        isRevealed={isPromptRevealed}
        onReplay={onReplay}
      />
      <div className="flex items-center justify-between rounded-xl border border-stone-200 bg-white px-4 py-3 shadow-sm dark:border-stone-700 dark:bg-stone-900">
        <div className="flex items-center gap-2">
          <div className={`h-2.5 w-2.5 rounded-full ${phase === "playing" ? "animate-pulse bg-teal-500" : phase === "reciting" ? "animate-pulse bg-rose-500" : "bg-stone-400"}`} />
          <p className="text-sm text-stone-600 dark:text-stone-300">
            {phase === "playing" ? t("playingPhase") : phase === "reciting" ? t("recitingPhase") : t("readyPhase")}
          </p>
        </div>
        {phase === "reciting" ? (
          <button type="button" onClick={onFinish} className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-medium text-stone-600 transition hover:bg-stone-100 dark:border-stone-600 dark:text-stone-300 dark:hover:bg-stone-800">
            {tOverlays("finishReading")}
          </button>
        ) : null}
      </div>
      <button type="button" onClick={onExit} className="text-center text-xs text-stone-400 underline-offset-2 hover:underline dark:text-stone-500">
        {tOverlays("exit")}
      </button>
    </div>
  );
}

export function UnveilActiveControls({
  onExit,
  onFinish,
  phase,
  unveilState,
}: {
  onExit: () => void;
  onFinish: () => void;
  phase: "prompting" | "reciting";
  unveilState: UnveilState;
}) {
  const t = useTranslations("hifz.unveil");
  const tOverlays = useTranslations("hifz.sessionOverlays");
  const progress = unveilState.totalWords > 0
    ? Math.round(((unveilState.revealedUpTo + 1) / unveilState.totalWords) * 100)
    : 0;
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-stone-900/40 backdrop-blur-[2px] sm:items-center">
      <div className="mx-4 mb-4 w-full max-w-sm sm:mb-0">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between rounded-xl border border-stone-200 bg-white px-4 py-3 shadow-sm dark:border-stone-700 dark:bg-stone-900">
            <div className="flex items-center gap-2">
              <div className={`h-2.5 w-2.5 animate-pulse rounded-full ${phase === "prompting" ? "bg-teal-500" : "bg-rose-500"}`} />
              <p className="text-sm text-stone-600 dark:text-stone-300">
                {phase === "prompting" ? tOverlays("listening") : t("recitingPhase")}
              </p>
            </div>
            {phase === "reciting" ? (
              <button type="button" onClick={onFinish} className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-medium text-stone-600 transition hover:bg-stone-100 dark:border-stone-600 dark:text-stone-300 dark:hover:bg-stone-800">
                {tOverlays("finishReading")}
              </button>
            ) : null}
          </div>
          <div className="rounded-xl border border-stone-200 bg-white px-4 py-2 shadow-sm dark:border-stone-700 dark:bg-stone-900">
            <div className="flex items-center justify-between text-xs text-stone-500 dark:text-stone-400">
              <span>{tOverlays("wordsProgress", { revealed: unveilState.revealedUpTo + 1, total: unveilState.totalWords })}</span>
              <span>{progress}%</span>
            </div>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
              <div className="h-full rounded-full bg-teal-500 transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
          </div>
          <button type="button" onClick={onExit} className="text-center text-xs text-stone-400 underline-offset-2 hover:underline dark:text-stone-500">{tOverlays("exit")}</button>
        </div>
      </div>
    </div>
  );
}
