"use client";

import Link from "next/link";
import { useMemo } from "react";
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
  inside: string[];
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
      chip: "border-teal-900/15 bg-teal-950/6 text-teal-900 dark:border-teal-300/20 dark:bg-teal-900/35 dark:text-teal-100",
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
      surface:
        "bg-[linear-gradient(145deg,rgba(238,242,255,0.96),rgba(255,255,255,0.92))] dark:bg-[linear-gradient(145deg,rgba(79,70,229,0.18),rgba(10,10,10,0.72))]",
      value: "text-indigo-900 dark:text-indigo-100",
    };
  }

  return {
    bar: "bg-stone-700 dark:bg-stone-300",
    border: "border-stone-900/10 dark:border-stone-300/14",
    chip: "border-stone-300/80 bg-stone-100/90 text-stone-700 dark:border-stone-700 dark:bg-stone-800/80 dark:text-stone-200",
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
            Mode
          </p>
          <h2 className="mt-2 text-2xl font-medium tracking-tight text-stone-900 dark:text-stone-50">
            {card.title}
          </h2>
        </div>
        <span
          className={`rounded-full border px-3 py-1 text-[11px] font-medium ${classes.chip}`}
        >
          Dalam mode ini
        </span>
      </div>

      <div className="mt-6 flex items-end justify-between gap-4">
        <div>
          <div className={`text-4xl font-semibold tracking-tight ${classes.value}`}>
            {card.metricValue}
          </div>
          <p className="mt-1 text-sm text-stone-600 dark:text-stone-300">
            {card.metricLabel}
          </p>
        </div>
        <p className="text-sm font-medium text-stone-500 dark:text-stone-400">
          {card.percent}%
        </p>
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

      <div className="mt-4 flex flex-wrap gap-2">
        {card.inside.map((item) => (
          <span
            key={`${card.title}-${item}`}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${classes.chip}`}
          >
            {item}
          </span>
        ))}
      </div>

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
        ? `Sambung dari page ${readingState.lastPage}. Mode Baca kekal tenang dengan Jump dan audio muncul bila diperlukan.`
        : "Mushaf sengaja minimal. Masuk terus ke bacaan, dan buka utiliti hanya bila perlu.",
      inside: ["Mushaf", "Jump", "Audio"],
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
          ? `${snapshot.faham.dueCount} kad due sedang menunggu. Kad baru direhatkan sementara sehingga backlog selesai.`
          : `${snapshot.faham.dueCount} kad due dan ${snapshot.faham.eligibleNewCount} kad layak baru sekarang, berdasarkan exposure dari baca, tema, dan hafal.`
        : "Engine kata demi kata sudah tersedia, tetapi statistik server belum dapat dimuat.",
      inside: ["FSRS", "WBW", "Baca/Tema/Hafal"],
      metricLabel: snapshot.faham
        ? `${snapshot.faham.reviewedWordCount} / ${snapshot.faham.totalWords} perkataan pernah masuk deck`
        : "Stat Faham belum tersedia",
      metricValue: `${snapshot.faham?.coveragePct ?? 0}%`,
      percent: snapshot.faham?.coveragePct ?? 0,
      title: "Faham",
      tone: "amber",
    },
    {
      helper: snapshot.tema && snapshot.tema.totalChunks > 0
        ? `${snapshot.tema.exploredCount} chunk sudah pernah diteroka. Laluan seterusnya ikut surah semasa: ${activeSurahLabel}.`
        : `Navigator tema ikut surah. Teruskan dari surah semasa ${activeSurahLabel} supaya bacaan dan tema bergerak seiring.`,
      inside: ["Chunk", "Ayat kunci", "Alur surah"],
      metricLabel: snapshot.tema && snapshot.tema.totalChunks > 0
        ? `${snapshot.tema.exploredCount} / ${snapshot.tema.totalChunks} chunk pernah diteroka`
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
          : "Workspace hafal kekal fokus pada Sabak, Sabqi, dan Manzil."
        : "Workspace hafal sedia digunakan, tetapi statistik server belum dapat dimuat.",
      inside: ["Sabak", "Sabqi", "Manzil"],
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
              Dan Miftah adalah kuncinya. Tinggalkan cara lama. 4 Mode - Baca,
              Faham, Tema, dan Hafal. Masanya untuk anda faham apa yang dibaca,
              dan hafal apa yang difahami.
            </p>
          </div>

          <Link
            href={`/read/${continuePage}`}
            onClick={() => {
              saveReadMode("read");
            }}
            className="inline-flex rounded-xl bg-teal-900 px-5 py-2.5 text-sm font-medium text-teal-50 transition hover:bg-teal-800 dark:bg-teal-700 dark:hover:bg-teal-600"
          >
            {readingState.lastPage ? "Masuk Miftah (Sambung Baca)" : "Masuk Miftah"}
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
