"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import type { FahamQueueSnapshot } from "../domain/queue";
import type { FahamSourcePreset } from "../domain/presets";
import { FahamQueuePreview } from "./FahamQueuePreview";
import { FahamStatsPanel } from "./FahamStatsPanel";
import {
  type FahamStats,
  useFahamWorkspaceSession,
} from "./useFahamWorkspaceSession";

const FahamSessionSummaryModal = dynamic(
  () => import("./FahamSessionSummaryModal").then((module) => module.FahamSessionSummaryModal),
  { ssr: false },
);
const FahamSourcePicker = dynamic(
  () => import("./FahamSourcePicker").then((module) => module.FahamSourcePicker),
  { ssr: false },
);
const FahamStudyCard = dynamic(
  () => import("./FahamStudyCard").then((module) => module.FahamStudyCard),
  { ssr: false },
);

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

export type { FahamStats } from "./useFahamWorkspaceSession";

export function FahamWorkspace({
  initialQueue,
  initialPreset = "mixed",
  initialStats = null,
  entryContext = null,
  setupMessage = null,
  shouldHydrateInitialQueue = false,
}: FahamWorkspaceProps) {
  const t = useTranslations("faham.workspace");
  const {
    answerState,
    audioEnabled,
    cards,
    correctAdvanceMode,
    currentCard,
    currentIndex,
    directionMode,
    errorMessage,
    foundCap,
    foundCount,
    handleAnswer,
    handleContinue,
    handleCorrectAdvanceModeChange,
    handleManualAudio,
    handleRetry,
    handleRevealAnswer,
    handleToggleAudio,
    hasLiveStats,
    isConfigExpanded,
    isHydratingInitialQueue,
    isPending,
    isRevision,
    masteredCount,
    preset,
    progressPct,
    reloadQueue,
    refreshStats,
    sessionSummary,
    setIsConfigExpanded,
    setSessionSummary,
    setShowPreview,
    showCelebration,
    showPreview,
    snapshot,
    statsStatus,
    syncBadge,
  } = useFahamWorkspaceSession({
    initialPreset,
    initialQueue,
    initialStats,
    shouldHydrateInitialQueue,
  });

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
              <p className="text-sm font-bold uppercase tracking-widest text-emerald-600 sm:text-base dark:text-emerald-400">{t("celebrationEyebrow")}</p>
              <p className="text-base font-bold text-emerald-950 sm:text-lg dark:text-emerald-50">{t("celebrationTitle")}</p>
            </div>
          </div>
        </div>
      )}

      {sessionSummary ? (
        <FahamSessionSummaryModal
          summary={sessionSummary}
          onClose={() => setSessionSummary(null)}
        />
      ) : null}

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
          {t("dueBacklogNotice")}
        </section>
      ) : null}

      {syncBadge ? (
        <div className="flex items-center">
          <span
            className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold tracking-wide ${syncBadge.className}`}
          >
            {syncBadge.label}
          </span>
        </div>
      ) : null}

      <FahamStatsPanel
        foundCap={foundCap}
        foundCount={foundCount}
        hasLiveStats={hasLiveStats}
        masteredCount={masteredCount}
        statsStatus={statsStatus}
      />

      {statsStatus === "error" ? (
        <section className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-200">
          <p>{t("statsErrorNotice")}</p>
          <button
            type="button"
            onClick={() => void refreshStats(false)}
            className="shrink-0 rounded-xl bg-amber-600 px-4 py-2 font-semibold text-white transition hover:bg-amber-700"
          >
            {t("statsErrorRetry")}
          </button>
        </section>
      ) : null}

      {showPreview && cards.length > 0 ? (
        <FahamQueuePreview
          cards={cards}
          onStart={() => setShowPreview(false)}
        />
      ) : null}

      {!showPreview && currentCard ? (
        <FahamStudyCard
          answerState={answerState}
          audioEnabled={audioEnabled}
          card={currentCard}
          cardCount={cards.length}
          currentIndex={currentIndex}
          isConfigExpanded={isConfigExpanded}
          isPending={isPending}
          onAnswer={handleAnswer}
          onContinue={handleContinue}
          onManualAudio={handleManualAudio}
          onRetry={handleRetry}
          onRevealAnswer={handleRevealAnswer}
          onToggleAudio={handleToggleAudio}
          onToggleConfig={() => setIsConfigExpanded((value) => !value)}
          progressPct={progressPct}
        />
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
            {t("hydratingDescription")}
          </p>
        </section>
      ) : cards.length === 0 ? (
        <section className="animate-fade-in-up rounded-3xl border border-stone-200/90 bg-white/88 p-8 text-center shadow-[0_25px_70px_-48px_rgba(28,25,23,0.55)] backdrop-blur-sm dark:border-stone-700 dark:bg-stone-900/80">
          <p className="text-2xl font-medium text-stone-900 dark:text-stone-100">
            {t("emptyQueueTitle")}
          </p>
          <p className="mt-2 text-base text-stone-600 dark:text-stone-300">
            {t("emptyQueueDescription")}
          </p>
          <button
            type="button"
            disabled={isPending}
            onClick={() => reloadQueue(preset, directionMode, isRevision)}
            className="mt-5 rounded-xl bg-teal-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? t("reloadQueuePending") : t("reloadQueueAction")}
          </button>
        </section>
      ) : null}

      {isConfigExpanded ? (
        <FahamSourcePicker
          correctAdvanceMode={correctAdvanceMode}
          directionMode={directionMode}
          isPending={isPending}
          onCorrectAdvanceModeChange={handleCorrectAdvanceModeChange}
          onReloadQueue={reloadQueue}
          preset={preset}
        />
      ) : null}
    </div>
  );
}
