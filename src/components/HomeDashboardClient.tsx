"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { SurahJumpTarget } from "@/lib/readNavigation";
import { saveReadMode } from "@/lib/readMode";
import { findMarkerForPage } from "@/lib/readNavigationUtils";
import type { HomeDashboardSnapshot } from "@/lib/homeDashboard";
import { buildHomeHero } from "@/lib/homeDashboardHero";
import { useReadingProgressState } from "@/lib/useReadingProgressState";

const TOTAL_QURAN_PAGES = 604;

type CardTone = "amber" | "indigo" | "stone" | "teal";

interface HomeDashboardClientProps {
  snapshot: HomeDashboardSnapshot;
  surahTargets: SurahJumpTarget[];
}

interface ModeCard {
  badge?: string;
  detail?: string;
  lines: Array<{
    label: string;
    value: string;
  }>;
  percent: number;
  title: string;
  tone: CardTone;
  href: string;
  buttonLabel: string;
  onClick?: () => void;
  secondaryHref?: string;
  secondaryLabel?: string;
  secondaryOnClick?: () => void;
}

interface HifzGoalMigrationOverride {
  dailyGoalCount: number;
  dailyGoalType: "hifz_pages";
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function formatActivityDate(value: string | null): string {
  if (!value) {
    return "Belum ada aktiviti";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Aktiviti baru";
  }

  return new Intl.DateTimeFormat("ms-MY", {
    day: "numeric",
    month: "short",
  }).format(date);
}

function isWithinRecentDays(value: string | null, days: number): boolean {
  if (!value) {
    return false;
  }

  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) {
    return false;
  }

  return Date.now() - timestamp <= days * 24 * 60 * 60 * 1000;
}

function toneClasses(tone: CardTone) {
  if (tone === "teal") {
    return {
      bar: "bg-teal-700 dark:bg-teal-300",
      border: "border-teal-900/18 dark:border-teal-300/18",
      chip: "border-teal-900/15 bg-teal-950/6 text-teal-900 dark:border-teal-300/20 dark:bg-teal-900/35 dark:text-teal-100",
      primaryButton: "bg-teal-900 text-teal-50 hover:bg-teal-800 dark:bg-teal-700 dark:text-white dark:hover:bg-teal-600",
      surface:
        "bg-[linear-gradient(145deg,rgba(240,253,250,0.96),rgba(255,255,255,0.92))] dark:bg-[linear-gradient(145deg,rgba(15,118,110,0.2),rgba(10,10,10,0.72))]",
      value: "text-teal-900 dark:text-teal-100",
    };
  }

  if (tone === "amber") {
    return {
      bar: "bg-amber-600 dark:bg-amber-300",
      border: "border-amber-900/15 dark:border-amber-300/18",
      chip: "border-amber-900/15 bg-amber-100/70 text-amber-900 dark:border-amber-300/18 dark:bg-amber-900/30 dark:text-amber-100",
      primaryButton: "bg-amber-600 text-amber-50 hover:bg-amber-500 dark:bg-amber-500 dark:text-stone-950 dark:hover:bg-amber-400",
      surface:
        "bg-[linear-gradient(145deg,rgba(255,251,235,0.96),rgba(255,255,255,0.92))] dark:bg-[linear-gradient(145deg,rgba(217,119,6,0.18),rgba(10,10,10,0.72))]",
      value: "text-amber-900 dark:text-amber-100",
    };
  }

  if (tone === "indigo") {
    return {
      bar: "bg-indigo-700 dark:bg-indigo-300",
      border: "border-indigo-900/15 dark:border-indigo-300/18",
      chip: "border-indigo-900/15 bg-indigo-100/70 text-indigo-900 dark:border-indigo-300/18 dark:bg-indigo-900/30 dark:text-indigo-100",
      primaryButton: "bg-indigo-700 text-indigo-50 hover:bg-indigo-600 dark:bg-indigo-600 dark:text-white dark:hover:bg-indigo-500",
      surface:
        "bg-[linear-gradient(145deg,rgba(238,242,255,0.96),rgba(255,255,255,0.92))] dark:bg-[linear-gradient(145deg,rgba(79,70,229,0.18),rgba(10,10,10,0.72))]",
      value: "text-indigo-900 dark:text-indigo-100",
    };
  }

  return {
    bar: "bg-stone-700 dark:bg-stone-300",
    border: "border-stone-900/10 dark:border-stone-300/14",
    chip: "border-stone-300/80 bg-stone-100/90 text-stone-700 dark:border-stone-700 dark:bg-stone-800/80 dark:text-stone-200",
    primaryButton: "bg-stone-900 text-stone-50 hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white",
    surface:
      "bg-[linear-gradient(145deg,rgba(250,250,249,0.96),rgba(255,255,255,0.92))] dark:bg-[linear-gradient(145deg,rgba(41,37,36,0.8),rgba(10,10,10,0.72))]",
    value: "text-stone-900 dark:text-stone-100",
  };
}

function shouldPrefetch(href: string): boolean {
  return !href.startsWith("/read/");
}

function buildHifzMushafHref(input: {
  page: number;
  block: "sabqi" | "sabak" | "manzil" | null;
  ayahKey: string | null;
}): string {
  const params = new URLSearchParams({
    mode: "hifz",
    from: "dashboard",
  });
  if (input.block) {
    params.set("block", input.block);
  }
  if (input.ayahKey) {
    params.set("ayah", input.ayahKey);
  }
  return `/read/${input.page}?${params.toString()}`;
}

function ModeProgressCard({ card }: { card: ModeCard }) {
  const classes = toneClasses(card.tone);

  return (
    <article
      className={`animate-fade-in-up flex flex-col rounded-[28px] border p-5 shadow-[0_24px_70px_-42px_rgba(28,25,23,0.42)] backdrop-blur-sm ${classes.border} ${classes.surface}`}
    >
      <div className="flex-1">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-stone-500 dark:text-stone-400">
              Mod
            </p>
            <div className="mt-2 flex items-center gap-2">
              <h2 className="text-2xl font-medium tracking-tight text-stone-900 dark:text-stone-50">
                {card.title}
              </h2>
              {card.badge ? (
                <span className="rounded-full border border-amber-300/80 bg-amber-100/80 px-2 py-0.5 text-[11px] font-semibold text-amber-900 dark:border-amber-500/40 dark:bg-amber-900/30 dark:text-amber-200">
                  {card.badge}
                </span>
              ) : null}
            </div>
          </div>
          <p className="text-sm font-medium text-stone-500 dark:text-stone-400">
            {card.percent}%
          </p>
        </div>

        <div className="mt-6">
          <div className="space-y-2.5">
            {card.lines.slice(0, 2).map((line) => (
              <div
                key={`${card.title}-${line.label}`}
                className="flex items-baseline justify-between gap-3"
              >
                <p className="text-[11px] uppercase tracking-[0.18em] text-stone-500 dark:text-stone-400">
                  {line.label}
                </p>
                <p className={`text-sm font-semibold ${classes.value}`}>
                  {line.value}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/80 ring-1 ring-stone-900/6 dark:bg-stone-950/70 dark:ring-white/8">
          <div
            className={`h-full rounded-full transition-all duration-500 ${classes.bar}`}
            style={{ width: `${card.percent}%` }}
          />
        </div>
        {card.detail ? (
          <p className="mt-2 text-xs text-stone-600 dark:text-stone-300">
            {card.detail}
          </p>
        ) : null}

      </div>

      <div className="mt-6">
        <Link
          href={card.href}
          prefetch={shouldPrefetch(card.href)}
          onClick={card.onClick}
          className={`block w-full rounded-xl py-2.5 text-center text-sm font-medium transition ${
            card.tone === "teal"
              ? "bg-teal-800/10 text-teal-900 hover:bg-teal-800/15 dark:bg-teal-300/10 dark:text-teal-200 dark:hover:bg-teal-300/20"
              : card.tone === "amber"
                ? "bg-amber-800/10 text-amber-950 hover:bg-amber-800/15 dark:bg-amber-300/10 dark:text-amber-200 dark:hover:bg-amber-300/20"
                : card.tone === "indigo"
                  ? "bg-indigo-800/10 text-indigo-900 hover:bg-indigo-800/15 dark:bg-indigo-300/10 dark:text-indigo-200 dark:hover:bg-indigo-300/20"
                  : "bg-stone-900/5 text-stone-900 hover:bg-stone-900/10 dark:bg-stone-100/10 dark:text-stone-200 dark:hover:bg-stone-100/20"
          }`}
        >
          {card.buttonLabel}
        </Link>
        {card.secondaryHref && card.secondaryLabel ? (
          <Link
            href={card.secondaryHref}
            prefetch={shouldPrefetch(card.secondaryHref)}
            onClick={card.secondaryOnClick}
            className="mt-2 block w-full rounded-xl border border-stone-300/80 bg-white/65 py-2.5 text-center text-sm font-medium text-stone-800 transition hover:bg-white/90 dark:border-stone-600 dark:bg-stone-900/55 dark:text-stone-100 dark:hover:bg-stone-800"
          >
            {card.secondaryLabel}
          </Link>
        ) : null}
      </div>
    </article>
  );
}

export function HomeDashboardClient({
  snapshot,
  surahTargets,
}: HomeDashboardClientProps) {
  const router = useRouter();
  const [migratingHifzGoal, startMigratingHifzGoal] = useTransition();
  const [submittingHifzGoalMigration, setSubmittingHifzGoalMigration] =
    useState(false);
  const [hifzGoalMigrationError, setHifzGoalMigrationError] = useState<string | null>(
    null,
  );
  const [hifzGoalMigrationOverride, setHifzGoalMigrationOverride] =
    useState<HifzGoalMigrationOverride | null>(null);
  const readingState = useReadingProgressState();
  const readSnapshot = snapshot.read;
  const continuePage = readSnapshot?.lastPage ?? readingState.lastPage ?? 1;
  const localReadLifetimeFloor = readingState.lastPage ? 1 : 0;
  const localReadRecentFloor =
    readingState.lastPage && isWithinRecentDays(readingState.lastReadAt, 7) ? 1 : 0;
  const uniquePagesLifetime = Math.max(
    readSnapshot?.uniquePagesLifetime ?? 0,
    localReadLifetimeFloor,
  );
  const uniquePages7d = Math.max(
    readSnapshot?.uniquePages7d ?? 0,
    localReadRecentFloor,
  );
  const readingPositionPct = clampPercent(
    (uniquePagesLifetime / TOTAL_QURAN_PAGES) * 100,
  );
  const formattedLastRead = formatActivityDate(
    readSnapshot?.lastReadAt ?? readingState.lastReadAt,
  );
  const activeSurah = useMemo(() => {
    const markers = surahTargets.map((target) => ({
      id: target.surah,
      name: target.name,
      page: target.page,
    }));

    return findMarkerForPage(markers, continuePage);
  }, [continuePage, surahTargets]);
  const activeSurahId = activeSurah?.id ?? 1;
  const fahamLevel = snapshot.faham?.levelProgress ?? null;
  const currentFahamCap = snapshot.faham?.focusWordLimit ?? 1000;
  const nextFahamCapLabel = fahamLevel?.nextWordLimit
    ? `${Math.round(fahamLevel.nextWordLimit / 1000)}k`
    : "seterusnya";
  const hifzReadTargetPage = snapshot.hifz?.nextPage ?? continuePage;
  const hifzReadHref = buildHifzMushafHref({
    page: hifzReadTargetPage,
    block: snapshot.hifz?.nextBlock ?? null,
    ayahKey: snapshot.hifz?.nextAyahKey ?? null,
  });
  const homeHero = buildHomeHero({
    activeSurahId,
    activeSurahName: activeSurah?.name ?? null,
    continuePage,
    formattedLastRead,
    hifzReadHref,
    snapshot,
  });
  const heroClasses = toneClasses(homeHero.tone);
  const activitySnapshot = useMemo(() => {
    if (!snapshot.activity) {
      return null;
    }
    if (!hifzGoalMigrationOverride) {
      return snapshot.activity;
    }

    return {
      ...snapshot.activity,
      dailyGoalCount: hifzGoalMigrationOverride.dailyGoalCount,
      dailyGoalType: hifzGoalMigrationOverride.dailyGoalType,
      legacyHifzGoalRecommendation: null,
    };
  }, [hifzGoalMigrationOverride, snapshot.activity]);

  const modeCards: ModeCard[] = [
    {
      lines: [
        {
          label: "Liputan",
          value: `${uniquePagesLifetime} / ${TOTAL_QURAN_PAGES} halaman`,
        },
        {
          label: "7 Hari",
          value: `${uniquePages7d} halaman`,
        },
      ],
      percent: readingPositionPct,
      title: "Baca",
      tone: "teal",
      href: `/read/${continuePage}`,
      buttonLabel: continuePage > 1 ? "Sambung Baca" : "Mula Baca",
    },
    {
      lines: snapshot.faham
        ? [
            {
              label: "Ditemui",
              value: `${snapshot.faham.encounteredWordCount} / ${snapshot.faham.focusWordLimit}`,
            },
            {
              label: "Mahir",
              value: `${snapshot.faham.masteredWordCount} / ${snapshot.faham.encounteredWordCount}`,
            },
          ]
        : [
            { label: "Ditemui", value: `0 / ${currentFahamCap}` },
            { label: "Mahir", value: "0 / 0" },
          ],
      badge: fahamLevel ? `L${fahamLevel.activeLevel}` : undefined,
      detail: fahamLevel
        ? fahamLevel.isMaxLevel
          ? "Tahap maksimum dibuka."
          : `L${fahamLevel.nextLevel} akan buka cap ke ${nextFahamCapLabel} perkataan.`
        : undefined,
      percent: snapshot.faham?.coveragePct ?? 0,
      title: "Faham",
      tone: "amber",
      href: "/faham",
      buttonLabel: snapshot.faham?.dueCount ? "Mula Ulang Kaji" : "Buka Faham",
    },
    {
      lines: snapshot.tema && snapshot.tema.totalChunks > 0
        ? [
            {
              label: "Diteroka",
              value: `${snapshot.tema.exploredCount} / ${snapshot.tema.totalChunks}`,
            },
            {
              label: "Selesai",
              value: `${snapshot.tema.completedCount}`,
            },
          ]
        : [
            { label: "Diteroka", value: "0 / 0" },
            { label: "Selesai", value: "0" },
          ],
      percent: snapshot.tema?.exploredPct ?? 0,
      title: "Tema",
      tone: "indigo",
      href: `/read/surah/${activeSurahId}/themes`,
      buttonLabel: "Teroka Tema",
    },
    {
      lines: snapshot.hifz
        ? [
            {
              label: "Manzil",
              value: `${snapshot.hifz.totalManzilPages} halaman`,
            },
            {
              label: "Ulangan Hari Ini",
              value: `${snapshot.hifz.dueTodayPages} halaman`,
            },
          ]
        : [
            { label: "Manzil", value: "0 halaman" },
            { label: "Ulangan Hari Ini", value: "0 halaman" },
          ],
      percent: snapshot.hifz?.manzilCoveragePct ?? 0,
      title: "Hafal",
      tone: "stone",
      href: "/hifz",
      buttonLabel: "Buka Hafal Plan",
      detail: snapshot.hifz?.nextPageLabel
        ? `Rujukan seterusnya: ${snapshot.hifz.nextPageLabel}`
        : "Belum ada rujukan seterusnya untuk hari ini.",
      onClick: () => saveReadMode("hifz"),
      secondaryHref: hifzReadHref,
      secondaryLabel: "Teruskan di Mushaf",
      secondaryOnClick: () => saveReadMode("hifz"),
    },
  ];

  const goalTypeLabel =
    activitySnapshot?.dailyGoalType === "faham_words"
      ? "perkataan"
      : activitySnapshot?.dailyGoalType === "read_pages"
        ? "halaman"
        : activitySnapshot?.dailyGoalType === "hifz_ayat"
          ? "ayat"
          : activitySnapshot?.dailyGoalType === "hifz_pages"
            ? "halaman"
          : activitySnapshot?.dailyGoalType === "theme_chunks"
            ? "tema"
            : "halaman";

  const goalProgressPct = clampPercent(
    activitySnapshot
      ? (activitySnapshot.todayProgress / activitySnapshot.dailyGoalCount) * 100
      : 0,
  );
  const legacyHifzGoalRecommendation =
    activitySnapshot?.legacyHifzGoalRecommendation ?? null;

  const handleMigrateLegacyHifzGoal = async () => {
    setHifzGoalMigrationError(null);
    setSubmittingHifzGoalMigration(true);
    try {
      const response = await fetch("/api/profile/daily-goal/hifz-pages", {
        method: "POST",
      });
      const payload = (await response.json().catch(() => null)) as
        | {
            error?: string;
            nextCount?: number;
          }
        | null;

      if (!response.ok) {
        setHifzGoalMigrationError(
          payload?.error ?? "Tak dapat tukar sasaran Hafal kepada halaman sekarang.",
        );
        return;
      }

      setHifzGoalMigrationOverride({
        dailyGoalCount:
          typeof payload?.nextCount === "number"
            ? payload.nextCount
            : (legacyHifzGoalRecommendation?.suggestedPageGoal ?? 1),
        dailyGoalType: "hifz_pages",
      });
      startMigratingHifzGoal(() => {
        router.refresh();
      });
    } catch {
      setHifzGoalMigrationError(
        "Tak dapat tukar sasaran Hafal kepada halaman sekarang.",
      );
    } finally {
      setSubmittingHifzGoalMigration(false);
    }
  };

  return (
    <div className="flex flex-col gap-10">
      {/* Activity Bar: Streaks & Goals */}
      <section className="animate-fade-in-up flex flex-wrap items-center justify-between gap-6 px-2">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-4">
            <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 dark:bg-amber-900/30">
              <svg
                className="h-7 w-7 text-amber-600 dark:text-amber-400"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path
                  d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              {activitySnapshot && activitySnapshot.streak > 0 && (
                <span className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-orange-600 text-[10px] font-bold text-white shadow-lg ring-2 ring-white dark:ring-stone-900">
                  {activitySnapshot.streak}
                </span>
              )}
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-stone-500 dark:text-stone-400">
                Streak Semasa
              </p>
              <p className="text-xl font-bold text-stone-900 dark:text-white">
                {activitySnapshot?.streak ?? 0} Hari
              </p>
            </div>
          </div>

          <div className="hidden h-10 w-px bg-stone-200 dark:bg-stone-800 sm:block" />

          <div className="flex items-center gap-4">
            <div className={`relative h-14 w-14 transition-transform duration-500 ${goalProgressPct >= 100 ? "scale-110" : ""}`}>
              <svg className="h-14 w-14 -rotate-90">
                <circle
                  cx="28"
                  cy="28"
                  r="24"
                  fill="transparent"
                  stroke="currentColor"
                  strokeWidth="4"
                  className="text-stone-100 dark:text-stone-800"
                />
                <circle
                  cx="28"
                  cy="28"
                  r="24"
                  fill="transparent"
                  stroke="currentColor"
                  strokeWidth="4"
                  strokeDasharray={2 * Math.PI * 24}
                  strokeDashoffset={2 * Math.PI * 24 * (1 - goalProgressPct / 100)}
                  strokeLinecap="round"
                  className={`${goalProgressPct >= 100 ? "text-emerald-500" : "text-teal-600 dark:text-teal-400"} transition-all duration-1000`}
                />
              </svg>
              <div className={`absolute inset-0 flex items-center justify-center font-bold ${goalProgressPct >= 100 ? "text-emerald-600 dark:text-emerald-400" : "text-teal-700 dark:text-teal-300"}`}>
                {goalProgressPct >= 100 ? (
                  <svg className="h-6 w-6 animate-bounce-in" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4">
                    <path d="M20 6L9 17L4 12" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  <span className="text-[10px]">{goalProgressPct}%</span>
                )}
              </div>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-stone-500 dark:text-stone-400">
                Sasaran Harian
              </p>
              <p className="text-xl font-bold text-stone-900 dark:text-white">
                {activitySnapshot?.todayProgress ?? 0} /{" "}
                {activitySnapshot?.dailyGoalCount ?? 10}{" "}
                <span className="text-sm font-medium text-stone-500">{goalTypeLabel}</span>
              </p>
            </div>
          </div>
        </div>

      </section>

      {legacyHifzGoalRecommendation ? (
        <section className="animate-fade-in-up rounded-[28px] border border-amber-200/80 bg-amber-50/85 p-5 shadow-sm backdrop-blur-sm dark:border-amber-700/30 dark:bg-amber-950/25">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-800 dark:text-amber-300">
                Legacy Hifz Goal
              </p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight text-stone-900 dark:text-stone-50">
                Tukar sasaran Hafal daripada ayat kepada halaman
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-stone-700 dark:text-stone-300">
                Sasaran semasa anda masih guna unit ayat. Miftah sekarang tunjuk progres Hafal dalam halaman, jadi kami cadangkan tukar
                {" "}
                <strong>{legacyHifzGoalRecommendation.currentAyahGoal} ayat</strong>
                {" "}
                kepada
                {" "}
                <strong>{legacyHifzGoalRecommendation.suggestedPageGoal} halaman</strong>
                {" "}
                supaya sasaran harian, papan pemuka, dan plan Hafal guna unit yang sama.
              </p>
              {hifzGoalMigrationError ? (
                <p className="mt-3 text-sm text-rose-700 dark:text-rose-300">
                  {hifzGoalMigrationError}
                </p>
              ) : null}
            </div>

            <button
              type="button"
              onClick={handleMigrateLegacyHifzGoal}
              disabled={submittingHifzGoalMigration || migratingHifzGoal}
              className="inline-flex items-center justify-center rounded-2xl bg-amber-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-amber-500 dark:text-stone-950 dark:hover:bg-amber-400"
            >
              {submittingHifzGoalMigration || migratingHifzGoal
                ? "Menukar..."
                : "Tukar ke Halaman"}
            </button>
          </div>
        </section>
      ) : null}

      <section
        className={`animate-fade-in-up relative overflow-hidden rounded-[36px] border p-6 shadow-[0_30px_100px_-50px_rgba(28,25,23,0.52)] backdrop-blur-md sm:p-8 ${heroClasses.border} ${heroClasses.surface}`}
      >
        <div className="relative z-10 grid gap-6 xl:grid-cols-[1.18fr_0.82fr] xl:items-end">
          <div className="max-w-3xl">
            <span
              className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium tracking-wide ${heroClasses.chip}`}
            >
              {homeHero.badge}
            </span>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-stone-900 dark:text-stone-50 sm:text-5xl">
              {homeHero.title}
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-stone-600 sm:text-lg dark:text-stone-300">
              {homeHero.description}
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href={homeHero.primaryHref}
                prefetch={shouldPrefetch(homeHero.primaryHref)}
                onClick={() => {
                  saveReadMode(homeHero.primaryMode);
                }}
                className={`inline-flex items-center justify-center rounded-2xl px-6 py-3 text-sm font-semibold transition ${heroClasses.primaryButton}`}
              >
                {homeHero.primaryLabel}
              </Link>
              {homeHero.secondaryHref && homeHero.secondaryLabel ? (
                <Link
                  href={homeHero.secondaryHref}
                  prefetch={shouldPrefetch(homeHero.secondaryHref)}
                  onClick={() => {
                    if (homeHero.secondaryMode) {
                      saveReadMode(homeHero.secondaryMode);
                    }
                  }}
                  className="inline-flex items-center justify-center rounded-2xl border border-stone-300/80 bg-white/75 px-6 py-3 text-sm font-medium text-stone-800 transition hover:bg-white dark:border-stone-600 dark:bg-stone-900/60 dark:text-stone-100 dark:hover:bg-stone-800"
                >
                  {homeHero.secondaryLabel}
                </Link>
              ) : null}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {homeHero.stats.map((item) => (
              <div
                key={`${item.label}-${item.value}`}
                className="rounded-[24px] border border-white/60 bg-white/72 p-4 shadow-[0_20px_60px_-45px_rgba(28,25,23,0.45)] backdrop-blur-sm dark:border-white/8 dark:bg-stone-950/42"
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-500 dark:text-stone-400">
                  {item.label}
                </p>
                <p className={`mt-2 text-base font-semibold ${heroClasses.value}`}>
                  {item.value}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-stone-300/8 blur-3xl dark:bg-stone-400/6" />
      </section>

      <section className="space-y-4">
        <div className="flex flex-col gap-2 px-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-stone-500 dark:text-stone-400">
              Mod lain
            </p>
            <h2 className="mt-1 text-2xl font-medium tracking-tight text-stone-900 dark:text-stone-50">
              Semua laluan masih tersedia
            </h2>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {modeCards.map((card) => (
            <ModeProgressCard key={card.title} card={card} />
          ))}
        </div>
      </section>
    </div>
  );
}
