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
  helper: string;
  metricLabel: string;
  metricValue: string;
  percent: number;
  title: string;
  tone: CardTone;
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
      className={`animate-fade-in-up rounded-[28px] border p-5 shadow-[0_24px_70px_-42px_rgba(28,25,23,0.42)] backdrop-blur-sm ${classes.border} ${classes.surface}`}
    >
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
        <div>
          <div className={`text-4xl font-semibold tracking-tight ${classes.value}`}>
            {card.metricValue}
          </div>
          <p className="mt-1 text-sm text-stone-600 dark:text-stone-300">
            {card.metricLabel}
          </p>
        </div>
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/80 ring-1 ring-stone-900/6 dark:bg-stone-950/70 dark:ring-white/8">
        <div
          className={`h-full rounded-full transition-all duration-500 ${classes.bar}`}
          style={{ width: `${card.percent}%` }}
        />
      </div>

      <p className="mt-4 text-sm leading-relaxed text-stone-600 dark:text-stone-300">
        {card.helper}
      </p>
    </article>
  );
}

export function HomeDashboardClient({
  snapshot,
  surahTargets,
}: HomeDashboardClientProps) {
  const readingState = useReadingProgressState();
  const continuePage = readingState.lastPage ?? 1;
  const readingPositionPct = clampPercent(
    readingState.lastPage
      ? (readingState.lastPage / TOTAL_QURAN_PAGES) * 100
      : 0,
  );
  const formattedLastRead = formatActivityDate(readingState.lastReadAt);
  const activeSurah = useMemo(() => {
    const markers = surahTargets.map((target) => ({
      id: target.surah,
      name: target.name,
      page: target.page,
    }));

    return findMarkerForPage(markers, continuePage);
  }, [continuePage, surahTargets]);
  const activeSurahId = activeSurah?.id ?? 1;
  const activeSurahLabel = activeSurah?.name ?? "Al-Fatihah";

  const modeCards: ModeCard[] = [
    {
      helper: readingState.lastPage
        ? `Sambung dari halaman ${readingState.lastPage}. Baca kekal ringkas, dan alat tambahan hanya muncul apabila diperlukan.`
        : "Mushaf sengaja diringkaskan. Masuk terus ke bacaan, kemudian buka alat tambahan apabila perlu.",
      metricLabel: readingState.lastPage
        ? `Bacaan terakhir ${formattedLastRead}`
        : "Belum ada sesi bacaan",
      metricValue: readingState.lastPage ? `p. ${readingState.lastPage}` : "Baru",
      percent: readingPositionPct,
      title: "Baca",
      tone: "teal",
    },
    {
      helper: snapshot.faham
        ? snapshot.faham.blockedReason === "due_backlog"
          ? `${snapshot.faham.dueCount} kad ulang kaji masih menunggu. Kad baharu dijeda sehingga baki ini selesai.`
          : `${snapshot.faham.dueCount} kad ulang kaji dan ${snapshot.faham.eligibleNewCount} kad baharu sedia dibuka daripada 3,000 perkataan teras.`
        : "Enjin kata demi kata sudah sedia, tetapi statistiknya belum dapat dimuat sekarang.",
      metricLabel: "perkataan dalam enjin Faham",
      metricValue: snapshot.faham
        ? `${snapshot.faham.reviewedWordCount} / ${snapshot.faham.totalWords} perkataan`
        : `0 / ${TOP_FAHAM_WORD_LIMIT} perkataan`,
      percent: snapshot.faham?.coveragePct ?? 0,
      title: "Faham",
      tone: "amber",
    },
    {
      helper: snapshot.tema && snapshot.tema.totalChunks > 0
        ? `${snapshot.tema.exploredCount} bahagian tema sudah diteroka. Laluan seterusnya ikut surah semasa: ${activeSurahLabel}.`
        : `Tema diatur mengikut surah. Teruskan dari surah semasa ${activeSurahLabel} supaya bacaan dan tema bergerak seiring.`,
      metricLabel: snapshot.tema && snapshot.tema.totalChunks > 0
        ? `${snapshot.tema.exploredCount} / ${snapshot.tema.totalChunks} bahagian telah dibuka`
        : `Sedia untuk Surah ${activeSurahId}`,
      metricValue: `${snapshot.tema?.exploredPct ?? 0}%`,
      percent: snapshot.tema?.exploredPct ?? 0,
      title: "Tema",
      tone: "indigo",
    },
    {
      helper: snapshot.hifz
        ? snapshot.hifz.todayTotal > 0
          ? `${snapshot.hifz.todayTotal} ayat aktif hari ini. ${snapshot.hifz.nextAyahLabel ? `Ayat seterusnya ${snapshot.hifz.nextAyahLabel}.` : "Sesi seterusnya sudah siap disusun."}`
          : "Ruang Hafal kekal fokus pada Sabak, Sabqi, dan Manzil."
        : "Ruang Hafal sedia digunakan, tetapi statistik server belum dapat dimuat.",
      metricLabel: snapshot.hifz
        ? `${snapshot.hifz.totalManzil} ayat sudah stabil di Manzil`
        : "Belum ada data hafal",
      metricValue: `${snapshot.hifz?.manzilCoveragePct ?? 0}%`,
      percent: snapshot.hifz?.manzilCoveragePct ?? 0,
      title: "Hafal",
      tone: "stone",
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <section className="animate-fade-in-up rounded-[32px] border border-stone-200/90 bg-white/82 p-5 shadow-[0_28px_90px_-48px_rgba(28,25,23,0.55)] backdrop-blur-sm sm:p-7 dark:border-stone-700 dark:bg-stone-900/78">
        <div className="space-y-5">
          <div className="inline-flex items-center rounded-full border border-teal-900/15 bg-teal-950/6 px-3 py-1 text-xs font-medium tracking-wide text-teal-900 dark:border-teal-300/20 dark:bg-teal-900/35 dark:text-teal-100">
            Dashboard Utama
          </div>

          <div className="space-y-3">
            <h1 className="max-w-4xl text-4xl font-medium leading-tight tracking-tight text-stone-900 sm:text-5xl dark:text-stone-50">
              Di Sebalik Setiap Ayat, Ada Khazanah Menanti.
            </h1>
            <p className="max-w-4xl text-base leading-relaxed text-stone-600 sm:text-lg dark:text-stone-300">
              Miftah membantu anda bergerak melalui empat mod: Baca, Faham,
              Tema, dan Hafal. Fokusnya mudah: fahami apa yang dibaca, lalu
              hafal dengan lebih bermakna.
            </p>
          </div>

          <Link
            href={`/read/${continuePage}`}
            onClick={() => {
              saveReadMode("read");
            }}
            className="inline-flex rounded-xl bg-teal-900 px-5 py-2.5 text-sm font-medium text-teal-50 transition hover:bg-teal-800 dark:bg-teal-700 dark:hover:bg-teal-600"
          >
            {readingState.lastPage ? "Sambung Baca" : "Mulakan Baca"}
          </Link>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {modeCards.map((card) => (
          <ModeProgressCard key={card.title} card={card} />
        ))}
      </section>
    </div>
  );
}
