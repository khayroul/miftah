"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import type { HifzQueueResponse } from "../domain/queue";
import type { HifzResumePoint } from "../domain/resumePoint";
import type { HifzStats, JuzStat } from "../domain/types";

export interface HifzImportSummary {
  count: number;
  juzProgress: JuzStat[];
  newPages: number;
  nextPage: number | null;
  queue: HifzQueueResponse | null;
  reviewPages: number;
  stats: HifzStats;
  upToPage: number;
}

export interface HifzPendingJourney {
  actionLabel: string;
  helperText: string;
  pageNumber: number;
}

export function HifzPendingJourneyOverlay({
  journey,
}: {
  journey: HifzPendingJourney;
}) {
  const t = useTranslations("hifz.overviewCards");
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-stone-950/60 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/95 p-6 shadow-2xl dark:bg-stone-900/95">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 animate-pulse rounded-2xl bg-amber-200/80 dark:bg-amber-500/25" />
          <div className="space-y-2">
            <div className="h-3 w-28 rounded-full bg-stone-200 dark:bg-stone-700" />
            <div className="h-4 w-44 rounded-full bg-stone-300 dark:bg-stone-600" />
          </div>
        </div>
        <p className="mt-5 text-lg font-semibold text-stone-900 dark:text-stone-100">
          {journey.actionLabel}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-stone-600 dark:text-stone-300">
          {journey.helperText}
        </p>
        <div className="mt-5 grid grid-cols-3 gap-3">
          <div className="h-20 rounded-2xl bg-stone-100 dark:bg-stone-800" />
          <div className="h-20 rounded-2xl bg-stone-100 dark:bg-stone-800" />
          <div className="h-20 rounded-2xl bg-stone-100 dark:bg-stone-800" />
        </div>
        <p className="mt-4 text-xs uppercase tracking-[0.18em] text-stone-500 dark:text-stone-400">
          {t("pendingPageLabel", { page: journey.pageNumber })}
        </p>
      </div>
    </div>
  );
}

export function HifzErrorNotice({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-red-200 bg-red-50/80 px-5 py-4 text-sm text-red-700 shadow-sm dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
      {message}
    </div>
  );
}

export function HifzImportSummaryCard({
  onContinue,
  onRefresh,
  summary,
}: {
  onContinue: () => void;
  onRefresh: () => void;
  summary: HifzImportSummary;
}) {
  const t = useTranslations("hifz.overviewCards");
  return (
    <div className="rounded-3xl border border-emerald-200/80 bg-emerald-50/80 p-6 shadow-sm backdrop-blur-sm dark:border-emerald-700/40 dark:bg-emerald-950/30 sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-300">
        {t("importSummaryEyebrow")}
      </p>
      <h3 className="mt-2 text-2xl font-bold text-stone-900 dark:text-stone-100">
        {t("importSummaryHeading")}
      </h3>
      <p className="mt-3 text-sm leading-relaxed text-stone-700 dark:text-stone-300">
        {summary.nextPage
          ? t("importSummaryBodyWithNext", { upToPage: summary.upToPage, nextPage: summary.nextPage })
          : t("importSummaryBodyComplete")}
      </p>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <SummaryStat label={t("statUpdated")} value={summary.upToPage} detail={t("statUpdatedDetail")} />
        <SummaryStat label={t("statNextPage")} value={summary.nextPage ?? "-"} detail={t("statNextPageDetail")} />
        <SummaryStat
          label={t("statPlanToday")}
          value={summary.newPages}
          detail={t("statPlanTodayDetail", { count: summary.reviewPages })}
        />
      </div>
      <p className="mt-5 text-sm leading-relaxed text-stone-600 dark:text-stone-300">
        {summary.newPages > 0 && summary.nextPage
          ? t("ctaNextRecommendation", { page: summary.nextPage })
          : t("noNewPagesNotice")}
      </p>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        {summary.queue && summary.queue.pageOrder.length > 0 ? (
          <button
            type="button"
            onClick={onContinue}
            className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-400"
          >
            {t("continueCta", { page: String(summary.nextPage) })}
          </button>
        ) : null}
        <button
          type="button"
          onClick={onRefresh}
          className="rounded-xl border border-emerald-300 bg-white/80 px-5 py-3 text-sm font-semibold text-emerald-900 transition hover:bg-white dark:border-emerald-700 dark:bg-stone-900/50 dark:text-emerald-200 dark:hover:bg-stone-900"
        >
          {t("refreshCta")}
        </button>
      </div>
    </div>
  );
}

function SummaryStat(props: {
  detail: string;
  label: string;
  value: number | string;
}) {
  return (
    <div className="rounded-2xl bg-white/85 p-4 shadow-sm dark:bg-stone-900/55">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-300">
        {props.label}
      </p>
      <p className="mt-2 text-2xl font-bold text-stone-900 dark:text-stone-100">
        {props.value}
      </p>
      <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
        {props.detail}
      </p>
    </div>
  );
}

export function HifzResumeCard(props: {
  isPending: boolean;
  onDismiss: () => void;
  onResume: () => void;
  resumePoint: HifzResumePoint;
}) {
  const t = useTranslations("hifz.overviewCards");
  return (
    <div className="rounded-2xl border border-amber-200/80 bg-amber-50/80 p-4 shadow-sm backdrop-blur-sm dark:border-amber-700/50 dark:bg-amber-900/20 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
            {t("resumeEyebrow")}
          </p>
          <p className="mt-1 text-sm font-medium text-stone-800 dark:text-stone-200">
            {t("resumeLabel", {
              flow: props.resumePoint.flow === "memorize" ? t("resumeFlowMemorize") : t("resumeFlowReview"),
              page: props.resumePoint.pageNumber,
            })}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={props.onResume}
            disabled={props.isPending}
            className="rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-600 active:bg-amber-700 disabled:opacity-40 dark:bg-amber-600 dark:hover:bg-amber-500"
          >
            {t("resumeCta")}
          </button>
          <button
            type="button"
            onClick={props.onDismiss}
            className="rounded-lg p-2 text-stone-400 transition hover:bg-stone-200/60 hover:text-stone-600 dark:text-stone-500 dark:hover:bg-stone-700/40 dark:hover:text-stone-300"
            aria-label={t("dismissAria")}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

export function HifzTodayCard(props: {
  canOpenMemorizeFlow: boolean;
  difficultCount: number;
  globalStreak: number;
  isGuest: boolean;
  isPending: boolean;
  loading: "memorize" | "review" | null;
  newPages: number;
  onMemorize: () => void;
  onReview: () => void;
  passagePicker: ReactNode;
  reviewPages: number;
  signInHref: string;
  showStartFresh: boolean;
}) {
  const t = useTranslations("hifz.overviewCards");
  const hasNew = props.newPages > 0;
  const hasReview = props.reviewPages > 0;

  if (props.isGuest) {
    return (
      <section className="rounded-2xl bg-surface-solid p-6 shadow-[0_18px_46px_rgba(15,23,42,0.10)] sm:p-8">
        <h2 className="text-2xl font-bold tracking-[-0.02em] text-foreground">
          {t("guestPracticeTitle")}
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
          {t("guestPracticeBody")}
        </p>
        <div className="mt-5">{props.passagePicker}</div>

        <div className="mt-6 border-t border-border-subtle pt-5">
          <Link
            href={props.signInHref}
            className="ui-touch-target inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-brand px-5 text-sm font-bold text-surface-solid transition-colors hover:bg-brand-strong"
          >
            {t("guestSignInCta")}
          </Link>
          <p className="mt-2 text-center text-xs leading-5 text-muted">
            {t("guestSignInHint")}
          </p>
        </div>

        <p className="mt-5 text-center text-sm">
          <a
            href="/tasmi/juzuk"
            className="ui-touch-target inline-flex min-h-11 items-center font-medium text-teal-700 underline-offset-4 hover:underline dark:text-teal-300"
          >
            {t("juzukLink")}
          </a>
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl bg-surface-solid p-6 shadow-[0_18px_46px_rgba(15,23,42,0.10)] sm:p-8">
      <h2 className="text-2xl font-bold tracking-[-0.02em] text-foreground">{t("todayTitle")}</h2>
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-base text-stone-600 dark:text-stone-400">
        {hasNew ? <span><span className="font-semibold text-amber-600 dark:text-amber-400">{props.newPages}</span>{" "}{t("newPagesSuffix", { count: props.newPages })}</span> : null}
        {hasNew && hasReview ? <span aria-hidden="true">&middot;</span> : null}
        {hasReview ? <span><span className="font-semibold text-teal-600 dark:text-teal-400">{props.reviewPages}</span>{" "}{t("reviewPagesSuffix", { count: props.reviewPages })}</span> : null}
        {!hasNew && !hasReview ? <span className="text-stone-500 dark:text-stone-400">{t("noPlanToday")}</span> : null}
      </div>
      <div className="mb-6 flex flex-wrap gap-x-4 gap-y-1">
        {props.globalStreak > 0 ? <p className="text-sm text-stone-500 dark:text-stone-400">{t("streakLabel", { count: props.globalStreak })}</p> : null}
        {props.difficultCount > 0 ? <p className="text-sm text-red-500 dark:text-red-400">{t("difficultAyahCount", { count: props.difficultCount })}</p> : null}
      </div>
      <div className="space-y-3">
        <button
          type="button"
          disabled={!hasReview || props.loading !== null || props.isPending}
          onClick={props.onReview}
          className="ui-touch-target flex min-h-16 w-full items-center justify-between gap-4 rounded-xl bg-[#0f766e] px-5 text-left text-white shadow-[0_10px_26px_rgba(15,118,110,0.24)] transition-colors hover:bg-[#115e59] active:bg-[#134e4a] disabled:cursor-not-allowed disabled:bg-teal-950/60 disabled:text-teal-50/90 disabled:shadow-none"
        >
          <span>
            <span className="block text-base font-bold">
              {props.loading === "review" ? t("loadingCta") : t("reviewCta")}
            </span>
            <span className="mt-0.5 block text-sm text-teal-50/85">
              {t("reviewFirstHint")}
            </span>
          </span>
          <svg aria-hidden="true" className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m9 18 6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button
          type="button"
          disabled={!props.canOpenMemorizeFlow || props.loading !== null || props.isPending}
          onClick={props.onMemorize}
          className="ui-touch-target flex min-h-14 w-full items-center justify-between gap-4 rounded-xl border border-amber-300 bg-amber-50 px-5 text-left text-amber-950 transition-colors hover:bg-amber-100 active:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-40 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-100 dark:hover:bg-amber-950/50"
        >
          <span>
            <span className="block text-sm font-bold">
              {props.loading === "memorize" ? t("loadingCta") : props.showStartFresh ? t("memorizeStartFresh") : t("memorizeNew")}
            </span>
            <span className="mt-0.5 block text-xs opacity-75">
              {t("continueHint")}
            </span>
          </span>
          <svg aria-hidden="true" className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m9 18 6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      {!hasNew && hasReview ? <p className="mt-3 text-center text-sm text-stone-400 dark:text-stone-500">{t("noNewToday")}</p> : null}
      {hasNew && !hasReview ? <p className="mt-3 text-center text-sm text-stone-400 dark:text-stone-500">{t("noReviewToday")}</p> : null}
      {props.showStartFresh ? <p className="mt-3 text-center text-sm text-stone-500 dark:text-stone-400">{t("noPlanYet")}</p> : null}
      <div className="mt-7 border-t border-border-subtle pt-6">
        <h3 className="text-base font-bold text-foreground">{t("freePracticeTitle")}</h3>
        <p className="mt-1 text-sm leading-6 text-muted">{t("freePracticeBody")}</p>
        <div className="mt-4">{props.passagePicker}</div>
      </div>
      <p className="mt-5 text-center text-sm">
        <a
          href="/tasmi/juzuk"
          className="ui-touch-target inline-flex min-h-11 items-center font-medium text-teal-700 underline-offset-4 hover:underline dark:text-teal-300"
        >
          {t("juzukLink")}
        </a>
      </p>
    </section>
  );
}
