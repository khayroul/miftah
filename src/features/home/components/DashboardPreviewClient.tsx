"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { HomeDashboardSnapshot } from "../domain/homeDashboard";
import {
  DashboardPreviewModeCard,
  type ModeCard,
} from "./DashboardPreviewModeCard";

const TOTAL_QURAN_PAGES = 604;

const INTL_LOCALE_BY_APP_LOCALE: Record<string, string> = {
  en: "en-US",
  ms: "ms-MY",
};

interface HifzSnapshot {
  dueTodayPages: number;
  manzilCoveragePct: number;
  nextPageLabel: string | null;
  streak: number;
  todayPages: number;
  totalManzilPages: number;
}
interface DashboardPreviewClientProps {
  hifzSnapshot: HifzSnapshot | null;
  homeSnapshot: HomeDashboardSnapshot;
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function formatActivityDate(
  t: (key: string, values?: Record<string, string | number | Date>) => string,
  intlLocale: string,
  value: string | null,
): string {
  if (!value) {
    return t("noActivityYet");
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return t("newActivity");
  }

  return new Intl.DateTimeFormat(intlLocale, {
    day: "numeric",
    month: "short",
  }).format(date);
}

export function DashboardPreviewClient({
  hifzSnapshot,
  homeSnapshot,
}: DashboardPreviewClientProps) {
  const locale = useLocale();
  const intlLocale = INTL_LOCALE_BY_APP_LOCALE[locale] ?? "ms-MY";
  const tDash = useTranslations("home.dashboard");
  const tNav = useTranslations("nav");
  const tSections = useTranslations("home.sections");
  const t = useTranslations("home.preview");
  const continuePage = homeSnapshot.read?.lastPage ?? 1;
  const readingPositionPct = clampPercent(
    homeSnapshot.read?.uniquePagesLifetime
      ? (homeSnapshot.read.uniquePagesLifetime / TOTAL_QURAN_PAGES) * 100
      : 0,
  );
  const formattedLastRead = formatActivityDate(
    tDash,
    intlLocale,
    homeSnapshot.read?.lastReadAt ?? null,
  );
  const hifzCoveragePct = hifzSnapshot?.manzilCoveragePct ?? 0;
  const hifzTodayPages = hifzSnapshot?.todayPages ?? 0;
  const hifzDueTodayPages = hifzSnapshot?.dueTodayPages ?? 0;

  const modeCards: ModeCard[] = [
    {
      ctaLabel: homeSnapshot.read?.lastPage
        ? t("ctaContinueReading")
        : t("ctaStartReading"),
      helper: homeSnapshot.read?.lastPage
        ? t("readHelperWithActivity", { activity: formattedLastRead })
        : t("readHelperEmpty"),
      href: `/read/${continuePage}`,
      inside: [t("chipMushaf"), t("chipContinue"), t("chipUtilityHub")],
      metricLabel: homeSnapshot.read?.lastPage
        ? t("pagesIn7Days", { count: homeSnapshot.read.uniquePages7d })
        : t("noReadingRecord"),
      metricValue: homeSnapshot.read?.lastPage ? `p. ${homeSnapshot.read.lastPage}` : t("newLabel"),
      percent: readingPositionPct,
      title: tNav("read"),
      tone: "teal",
    },
    {
      ctaLabel: t("ctaOpenWbwEngine"),
      helper: t("fahamHelper"),
      href: `/read/${continuePage}`,
      inside: [t("chipRecall"), t("chipReveal"), t("chipPadananBm")],
      metricLabel: t("sampleWbwProgress"),
      metricValue: "36%",
      percent: 36,
      previewOnly: true,
      title: tNav("faham"),
      tone: "amber",
    },
    {
      ctaLabel: t("ctaOpenThemeNavigator"),
      helper: t("temaHelper"),
      href: "/read/surah/2/themes",
      inside: [t("chipChunk"), t("chipAyatKunci"), t("chipAlurSurah")],
      metricLabel: t("sampleTemaProgress"),
      metricValue: "22%",
      percent: 22,
      previewOnly: true,
      title: tNav("tema"),
      tone: "indigo",
    },
    {
      ctaLabel: t("ctaEnterHifzBoard"),
      helper:
        hifzSnapshot && hifzTodayPages > 0
          ? t("hifzHelperActive", {
              todayPages: hifzTodayPages,
              duePages: hifzDueTodayPages,
            })
          : t("hifzHelperEmpty"),
      href: "/hifz",
      inside: [t("chipSabak"), t("chipSabqi"), t("chipManzil")],
      metricLabel:
        hifzSnapshot && hifzSnapshot.totalManzilPages > 0
          ? t("manzilStablePages", { count: hifzSnapshot.totalManzilPages })
          : t("noStableHifzData"),
      metricValue: `${hifzCoveragePct}%`,
      percent: hifzCoveragePct,
      title: tNav("hifz"),
      tone: "stone",
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <section className="animate-fade-in-up rounded-[32px] border border-stone-200/90 bg-white/82 p-5 shadow-[0_28px_90px_-48px_rgba(28,25,23,0.55)] backdrop-blur-sm sm:p-7 dark:border-stone-700 dark:bg-stone-900/78">
        <div className="grid gap-6 xl:grid-cols-[1.18fr_0.82fr]">
          <div className="space-y-6">
            <div className="inline-flex items-center rounded-full border border-teal-900/15 bg-teal-950/6 px-3 py-1 text-xs font-medium tracking-wide text-teal-900 dark:border-teal-300/20 dark:bg-teal-900/35 dark:text-teal-100">
              {t("eyebrow")}
            </div>

            <div className="space-y-3">
              <h1 className="max-w-3xl text-4xl font-medium leading-tight tracking-tight text-stone-900 sm:text-5xl dark:text-stone-50">
                {t("headlineLine1")}
                <span className="block text-teal-900 dark:text-teal-200">
                  {t("headlineLine2")}
                </span>
              </h1>
              <p className="max-w-2xl text-base leading-relaxed text-stone-600 sm:text-lg dark:text-stone-300">
                {t("introParagraph")}
              </p>
            </div>

            <div className="flex flex-wrap gap-2 text-xs text-stone-700 dark:text-stone-200">
              <span className="rounded-full border border-stone-300 bg-stone-100 px-3 py-1 dark:border-stone-600 dark:bg-stone-800">
                {tNav("read")}
              </span>
              <span className="rounded-full border border-stone-300 bg-stone-100 px-3 py-1 dark:border-stone-600 dark:bg-stone-800">
                {tNav("faham")}
              </span>
              <span className="rounded-full border border-stone-300 bg-stone-100 px-3 py-1 dark:border-stone-600 dark:bg-stone-800">
                {tNav("tema")}
              </span>
              <span className="rounded-full border border-stone-300 bg-stone-100 px-3 py-1 dark:border-stone-600 dark:bg-stone-800">
                {tNav("hifz")}
              </span>
              <span className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-amber-900 dark:border-amber-600 dark:bg-amber-950/50 dark:text-amber-100">
                {t("tadabburLaterChip")}
              </span>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href={`/read/${continuePage}`}
                prefetch={false}
                className="rounded-xl bg-teal-900 px-5 py-2.5 text-sm font-medium text-teal-50 transition hover:bg-teal-800 dark:bg-teal-700 dark:hover:bg-teal-600"
              >
                {t("enterRead")}
              </Link>
              <Link
                href="/hifz"
                className="rounded-xl border border-stone-300 bg-white px-5 py-2.5 text-sm font-medium text-stone-700 transition hover:bg-stone-100 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
              >
                {t("enterHifz")}
              </Link>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-stone-200/80 bg-stone-50/90 px-4 py-3 dark:border-stone-700 dark:bg-stone-900/80">
                  <p className="text-xs uppercase tracking-[0.2em] text-stone-500 dark:text-stone-400">
                    {t("lastPageLabel")}
                  </p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight text-stone-900 dark:text-stone-100">
                  {homeSnapshot.read?.lastPage ? `p. ${homeSnapshot.read.lastPage}` : "p. 1"}
                  </p>
                </div>
              <div className="rounded-2xl border border-stone-200/80 bg-stone-50/90 px-4 py-3 dark:border-stone-700 dark:bg-stone-900/80">
                <p className="text-xs uppercase tracking-[0.2em] text-stone-500 dark:text-stone-400">
                  {t("lastReadingLabel")}
                </p>
                <p className="mt-2 text-2xl font-semibold tracking-tight text-stone-900 dark:text-stone-100">
                  {formattedLastRead}
                </p>
              </div>
              <div className="rounded-2xl border border-stone-200/80 bg-stone-50/90 px-4 py-3 dark:border-stone-700 dark:bg-stone-900/80">
                <p className="text-xs uppercase tracking-[0.2em] text-stone-500 dark:text-stone-400">
                  {t("dueHifzLabel")}
                </p>
                <p className="mt-2 text-2xl font-semibold tracking-tight text-stone-900 dark:text-stone-100">
                  {hifzDueTodayPages}
                </p>
              </div>
              <div className="rounded-2xl border border-stone-200/80 bg-stone-50/90 px-4 py-3 dark:border-stone-700 dark:bg-stone-900/80">
                  <p className="text-xs uppercase tracking-[0.2em] text-stone-500 dark:text-stone-400">
                    {tSections("streakLabel")}
                  </p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight text-stone-900 dark:text-stone-100">
                  {tSections("streakDaysValue", { count: homeSnapshot.activity?.streak ?? 0 })}
                  </p>
                </div>
            </div>
          </div>

          <aside className="rounded-[28px] border border-stone-200/80 bg-stone-50/90 p-4 dark:border-stone-700 dark:bg-stone-950/60">
            <div className="rounded-[24px] bg-[radial-gradient(circle_at_top_left,rgba(20,94,89,0.12),transparent_48%),linear-gradient(180deg,rgba(255,255,255,0.96),rgba(245,245,244,0.92))] p-4 dark:bg-[radial-gradient(circle_at_top_left,rgba(45,212,191,0.14),transparent_48%),linear-gradient(180deg,rgba(28,25,23,0.96),rgba(12,10,9,0.92))]">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500 dark:text-stone-400">
                {t("suggestedFlowTitle")}
              </p>
              <div className="mt-5 space-y-3">
                <Link
                  href={`/read/${continuePage}`}
                  prefetch={false}
                  className="block rounded-2xl border border-teal-900/10 bg-white/92 px-4 py-4 transition hover:bg-white dark:border-teal-300/10 dark:bg-stone-900/80 dark:hover:bg-stone-900"
                >
                  <p className="text-xs uppercase tracking-[0.18em] text-stone-500 dark:text-stone-400">
                    {t("step1Label")}
                  </p>
                  <p className="mt-1 text-lg font-medium text-stone-900 dark:text-stone-100">
                    {homeSnapshot.read?.lastPage
                      ? t("continueAtPage", { page: homeSnapshot.read.lastPage })
                      : t("startAtPage1")}
                  </p>
                  <p className="mt-1 text-sm text-stone-600 dark:text-stone-300">
                    {t("step1Helper")}
                  </p>
                </Link>

                <Link
                  href="/hifz"
                  className="block rounded-2xl border border-stone-900/8 bg-white/92 px-4 py-4 transition hover:bg-white dark:border-white/8 dark:bg-stone-900/80 dark:hover:bg-stone-900"
                >
                  <p className="text-xs uppercase tracking-[0.18em] text-stone-500 dark:text-stone-400">
                    {t("step2Label")}
                  </p>
                  <p className="mt-1 text-lg font-medium text-stone-900 dark:text-stone-100">
                    {hifzTodayPages > 0
                      ? t("pagesInTodaySession", { count: hifzTodayPages })
                      : t("openSabakSabqiManzil")}
                  </p>
                  <p className="mt-1 text-sm text-stone-600 dark:text-stone-300">
                    {hifzSnapshot?.nextPageLabel
                      ? t("nextPageLabel", { label: hifzSnapshot.nextPageLabel })
                      : t("step2Helper")}
                  </p>
                </Link>

                <Link
                  href={`/read/${continuePage}`}
                  prefetch={false}
                  className="block rounded-2xl border border-stone-900/8 bg-white/92 px-4 py-4 transition hover:bg-white dark:border-white/8 dark:bg-stone-900/80 dark:hover:bg-stone-900"
                >
                  <p className="text-xs uppercase tracking-[0.18em] text-stone-500 dark:text-stone-400">
                    {t("step3Label")}
                  </p>
                  <p className="mt-1 text-lg font-medium text-stone-900 dark:text-stone-100">
                    {t("jumpAudioOutside")}
                  </p>
                  <p className="mt-1 text-sm text-stone-600 dark:text-stone-300">
                    {t("step3Helper")}
                  </p>
                </Link>
              </div>
            </div>

            <p className="px-2 pb-1 pt-4 text-xs leading-relaxed text-stone-500 dark:text-stone-400">
              {t("footerNote")}
            </p>
          </aside>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        {modeCards.map((card, index) => (
          <div key={card.title} style={{ animationDelay: `${110 + index * 70}ms` }}>
            <DashboardPreviewModeCard card={card} />
          </div>
        ))}
      </section>

      <section className="animate-fade-in-up rounded-[28px] border border-teal-900/14 bg-[linear-gradient(145deg,rgba(240,253,250,0.92),rgba(255,255,255,0.82))] p-5 shadow-[0_18px_54px_-38px_rgba(20,94,89,0.35)] backdrop-blur-sm dark:border-teal-300/18 dark:bg-[linear-gradient(145deg,rgba(15,118,110,0.2),rgba(10,10,10,0.72))]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-900 dark:text-teal-200">
              {t("utilityLayerEyebrow")}
            </p>
            <h2 className="mt-2 text-3xl font-medium tracking-tight text-stone-900 dark:text-stone-50">
              {t("utilityLayerTitle")}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-stone-700 dark:text-stone-300">
              {t("utilityLayerParagraph")}
            </p>
          </div>

          <div className="flex flex-wrap gap-2 text-xs text-teal-950 dark:text-teal-100">
            <span className="rounded-full border border-teal-900/15 bg-teal-100/85 px-3 py-1 dark:border-teal-200/18 dark:bg-teal-900/40">
              {t("chipJumpToPage")}
            </span>
            <span className="rounded-full border border-teal-900/15 bg-teal-100/85 px-3 py-1 dark:border-teal-200/18 dark:bg-teal-900/40">
              {t("chipJumpToSurah")}
            </span>
            <span className="rounded-full border border-teal-900/15 bg-teal-100/85 px-3 py-1 dark:border-teal-200/18 dark:bg-teal-900/40">
              {t("chipJumpToJuz")}
            </span>
            <span className="rounded-full border border-teal-900/15 bg-teal-100/85 px-3 py-1 dark:border-teal-200/18 dark:bg-teal-900/40">
              {t("chipAudioRepeat")}
            </span>
          </div>
        </div>
      </section>

      <section className="animate-fade-in-up-delay rounded-[28px] border border-amber-200/80 bg-[linear-gradient(145deg,rgba(255,251,235,0.92),rgba(255,255,255,0.82))] p-5 shadow-[0_18px_54px_-38px_rgba(120,53,15,0.35)] backdrop-blur-sm dark:border-amber-700/30 dark:bg-[linear-gradient(145deg,rgba(120,53,15,0.2),rgba(10,10,10,0.72))]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-900 dark:text-amber-200">
              {t("laterLayerEyebrow")}
            </p>
            <h2 className="mt-2 text-3xl font-medium tracking-tight text-stone-900 dark:text-stone-50">
              Tadabbur
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-stone-700 dark:text-stone-300">
              {t.rich("tadabburParagraph", {
                em: (chunks) => <span className="font-semibold">{chunks}</span>,
              })}
            </p>
          </div>

          <div className="flex flex-wrap gap-2 text-xs text-amber-950 dark:text-amber-100">
            <span className="rounded-full border border-amber-900/15 bg-amber-100/85 px-3 py-1 dark:border-amber-200/18 dark:bg-amber-900/40">
              {t("tafsirRingkas")}
            </span>
            <span className="rounded-full border border-amber-900/15 bg-amber-100/85 px-3 py-1 dark:border-amber-200/18 dark:bg-amber-900/40">
              {t("hadithSokongan")}
            </span>
            <span className="rounded-full border border-amber-900/15 bg-amber-100/85 px-3 py-1 dark:border-amber-200/18 dark:bg-amber-900/40">
              {t("renungan")}
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
