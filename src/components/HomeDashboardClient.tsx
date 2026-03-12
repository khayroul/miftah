"use client";

import Link from "next/link";
import { useMemo } from "react";
import { TOP_FAHAM_WORD_LIMIT } from "@/lib/faham/config";
import type { SurahJumpTarget } from "@/lib/readNavigation";
import { saveReadMode } from "@/lib/readMode";
import { findMarkerForPage } from "@/lib/readNavigationUtils";
import type { HomeDashboardSnapshot } from "@/lib/homeDashboard";
import { useReadingProgressState } from "@/lib/useReadingProgressState";

const TOTAL_QURAN_PAGES = 604;

type CardTone = "amber" | "indigo" | "stone" | "teal";

interface HomeDashboardClientProps {
  snapshot: HomeDashboardSnapshot;
  surahTargets: SurahJumpTarget[];
}

interface ModeCard {
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

function toneClasses(tone: CardTone) {
  if (tone === "teal") {
    return {
      bar: "bg-teal-700 dark:bg-teal-300",
      border: "border-teal-900/18 dark:border-teal-300/18",
      surface:
        "bg-[linear-gradient(145deg,rgba(240,253,250,0.96),rgba(255,255,255,0.92))] dark:bg-[linear-gradient(145deg,rgba(15,118,110,0.2),rgba(10,10,10,0.72))]",
      value: "text-teal-900 dark:text-teal-100",
    };
  }

  if (tone === "amber") {
    return {
      bar: "bg-amber-600 dark:bg-amber-300",
      border: "border-amber-900/15 dark:border-amber-300/18",
      surface:
        "bg-[linear-gradient(145deg,rgba(255,251,235,0.96),rgba(255,255,255,0.92))] dark:bg-[linear-gradient(145deg,rgba(217,119,6,0.18),rgba(10,10,10,0.72))]",
      value: "text-amber-900 dark:text-amber-100",
    };
  }

  if (tone === "indigo") {
    return {
      bar: "bg-indigo-700 dark:bg-indigo-300",
      border: "border-indigo-900/15 dark:border-indigo-300/18",
      surface:
        "bg-[linear-gradient(145deg,rgba(238,242,255,0.96),rgba(255,255,255,0.92))] dark:bg-[linear-gradient(145deg,rgba(79,70,229,0.18),rgba(10,10,10,0.72))]",
      value: "text-indigo-900 dark:text-indigo-100",
    };
  }

  return {
    bar: "bg-stone-700 dark:bg-stone-300",
    border: "border-stone-900/10 dark:border-stone-300/14",
    surface:
      "bg-[linear-gradient(145deg,rgba(250,250,249,0.96),rgba(255,255,255,0.92))] dark:bg-[linear-gradient(145deg,rgba(41,37,36,0.8),rgba(10,10,10,0.72))]",
    value: "text-stone-900 dark:text-stone-100",
  };
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
            <h2 className="mt-2 text-2xl font-medium tracking-tight text-stone-900 dark:text-stone-50">
              {card.title}
            </h2>
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

      </div>

      <div className="mt-6">
        <Link
          href={card.href}
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
      </div>
    </article>
  );
}

export function HomeDashboardClient({
  snapshot,
  surahTargets,
}: HomeDashboardClientProps) {
  const readingState = useReadingProgressState();
  const readSnapshot = snapshot.read;
  const continuePage = readSnapshot?.lastPage ?? readingState.lastPage ?? 1;
  const uniquePagesLifetime = readSnapshot?.uniquePagesLifetime ?? (readingState.lastPage ? 1 : 0);
  const uniquePages7d = readSnapshot?.uniquePages7d ?? (readingState.lastPage ? 1 : 0);
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
              value: `${snapshot.faham.encounteredWordCount} / ${snapshot.faham.totalWords}`,
            },
            {
              label: "Mahir",
              value: `${snapshot.faham.masteredWordCount}`,
            },
          ]
        : [
            { label: "Ditemui", value: `0 / ${TOP_FAHAM_WORD_LIMIT}` },
            { label: "Mahir", value: "0" },
          ],
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
              value: `${snapshot.hifz.totalManzil} ayat`,
            },
            {
              label: "Ulangan Hari Ini",
              value: `${snapshot.hifz.dueTodayCount}`,
            },
          ]
        : [
            { label: "Manzil", value: "0 ayat" },
            { label: "Ulangan Hari Ini", value: "0" },
          ],
      percent: snapshot.hifz?.manzilCoveragePct ?? 0,
      title: "Hafal",
      tone: "stone",
      href: `/read/${continuePage}`,
      buttonLabel: "Buka Hafal",
      onClick: () => saveReadMode("hifz"),
    },
  ];

  const goalTypeLabel =
    snapshot.activity?.dailyGoalType === "faham_words"
      ? "perkataan"
      : snapshot.activity?.dailyGoalType === "read_pages"
        ? "halaman"
        : "ayat";

  const goalProgressPct = clampPercent(
    snapshot.activity
      ? (snapshot.activity.todayProgress / snapshot.activity.dailyGoalCount) * 100
      : 0,
  );

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
              {snapshot.activity && snapshot.activity.streak > 0 && (
                <span className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-orange-600 text-[10px] font-bold text-white shadow-lg ring-2 ring-white dark:ring-stone-900">
                  {snapshot.activity.streak}
                </span>
              )}
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-stone-500 dark:text-stone-400">
                Streak Semasa
              </p>
              <p className="text-xl font-bold text-stone-900 dark:text-white">
                {snapshot.activity?.streak ?? 0} Hari
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
                {snapshot.activity?.todayProgress ?? 0} /{" "}
                {snapshot.activity?.dailyGoalCount ?? 10}{" "}
                <span className="text-sm font-medium text-stone-500">{goalTypeLabel}</span>
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-full border border-stone-200 bg-white/50 px-4 py-2 dark:border-stone-800 dark:bg-stone-900/50">
          <div className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
          <span className="text-xs font-medium text-stone-600 dark:text-stone-400">
            Sesi aktif: {formattedLastRead}
          </span>
        </div>
      </section>
      {/* Beta Welcome Banner */}
      <section className="animate-fade-in-up relative overflow-hidden rounded-[40px] border border-stone-200/60 bg-white/50 p-8 shadow-sm backdrop-blur-md dark:border-stone-800/60 dark:bg-stone-900/50 sm:p-12">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-8">
          <div className="max-w-2xl">
            <h1 className="text-4xl font-bold tracking-tight text-stone-900 dark:text-stone-100 sm:text-5xl">
              Selamat Datang ke Miftah Beta 🌙
            </h1>
            <p className="mt-5 text-lg leading-relaxed text-stone-600 dark:text-stone-400">
              Hafal Al-Quran dengan kefahaman. Sebagai pengguna beta awal, 
              setiap maklum balas anda (klik butang di penjuru bawah) amat kami hargai.
            </p>
          </div>
          <div className="flex shrink-0 gap-3">
            <Link
              href={`/read/${continuePage}`}
              onClick={() => {
                saveReadMode("read");
              }}
              className="flex items-center justify-center rounded-2xl bg-teal-900 px-8 py-4 text-sm font-semibold text-white transition hover:bg-teal-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white"
            >
              {readingState.lastPage ? `Sambung Hal. ${continuePage}` : "Mula Membaca"}
            </Link>
          </div>
        </div>
        {/* Subtle decoration */}
        <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-teal-200/20 blur-3xl dark:bg-teal-900/10" />
      </section>


      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {modeCards.map((card) => (
          <ModeProgressCard key={card.title} card={card} />
        ))}
      </section>
    </div>
  );
}
