"use client";

import Link from "next/link";
import { useReadingProgressState } from "@/lib/useReadingProgressState";

const TOTAL_QURAN_PAGES = 604;

type CardTone = "teal" | "amber" | "indigo" | "stone";

interface HifzSnapshot {
  dueTodayCount: number;
  manzilCoveragePct: number;
  nextAyahLabel: string | null;
  streak: number;
  todayTotal: number;
  totalManzil: number;
}

interface DashboardPreviewClientProps {
  hifzSnapshot: HifzSnapshot | null;
}

interface ModeCard {
  ctaLabel: string;
  helper: string;
  href: string;
  inside: string[];
  metricLabel: string;
  metricValue: string;
  percent: number;
  previewOnly?: boolean;
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

function shouldPrefetch(href: string): boolean {
  return !href.startsWith("/read/");
}

function ModeProgressCard({
  card,
}: {
  card: ModeCard;
}) {
  const classes = toneClasses(card.tone);

  return (
    <article
      className={`animate-fade-in-up rounded-[28px] border p-5 shadow-[0_24px_70px_-42px_rgba(28,25,23,0.42)] backdrop-blur-sm ${classes.border} ${classes.surface}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-stone-500 dark:text-stone-400">
            {card.previewOnly ? "Proposal" : "Live"}
          </p>
          <h2 className="mt-2 text-2xl font-medium tracking-tight text-stone-900 dark:text-stone-50">
            {card.title}
          </h2>
        </div>
        <span
          className={`rounded-full border px-3 py-1 text-[11px] font-medium ${classes.chip}`}
        >
          {card.previewOnly ? "Cadangan metric" : "Siap dipakai"}
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
          className={`h-full rounded-full transition-all duration-500 ${classes.bar} ${
            card.previewOnly ? "opacity-80" : ""
          }`}
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

      <Link
        href={card.href}
        prefetch={shouldPrefetch(card.href)}
        className="mt-6 inline-flex rounded-xl border border-stone-900/10 bg-white/80 px-4 py-2 text-sm font-medium text-stone-800 transition hover:bg-white dark:border-white/10 dark:bg-stone-950/60 dark:text-stone-100 dark:hover:bg-stone-950"
      >
        {card.ctaLabel}
      </Link>
    </article>
  );
}

export function DashboardPreviewClient({
  hifzSnapshot,
}: DashboardPreviewClientProps) {
  const readingState = useReadingProgressState();

  const continuePage = readingState.lastPage ?? 1;
  const readingPositionPct = clampPercent(
    readingState.lastPage
      ? (readingState.lastPage / TOTAL_QURAN_PAGES) * 100
      : 0,
  );
  const formattedLastRead = formatActivityDate(readingState.lastReadAt);
  const hifzCoveragePct = hifzSnapshot?.manzilCoveragePct ?? 0;
  const hifzTodayTotal = hifzSnapshot?.todayTotal ?? 0;
  const hifzDueTodayCount = hifzSnapshot?.dueTodayCount ?? 0;

  const modeCards: ModeCard[] = [
    {
      ctaLabel: readingState.lastPage ? "Sambung baca" : "Mulakan bacaan",
      helper: readingState.lastPage
        ? `Simpan muka terakhir sahaja supaya sambungan sesi rasa segera. Jump dan audio saya cadangkan keluar ke utility layer berasingan. Aktiviti terakhir ${formattedLastRead}.`
        : "Mushaf kekal minimal. Fokus utama ialah terus masuk baca tanpa bookmark dan tanpa panel utiliti di atas halaman.",
      href: `/read/${continuePage}`,
      inside: ["Mushaf", "Continue", "Utility hub"],
      metricLabel: readingState.lastPage
        ? `Kedudukan semasa sekitar page ${readingState.lastPage}`
        : "Belum ada rekod bacaan",
      metricValue: readingState.lastPage ? `p. ${readingState.lastPage}` : "Baru",
      percent: readingPositionPct,
      title: "Baca",
      tone: "teal",
    },
    {
      ctaLabel: "Buka engine WBW",
      helper:
        "Saya faham mod ini sebagai engine hafalan kata demi kata: padankan perkataan Arab dengan makna BM, buat recall, kemudian reveal jawapan sedikit demi sedikit.",
      href: `/read/${continuePage}`,
      inside: ["Recall", "Reveal", "Padanan BM"],
      metricLabel: "Contoh progress hafalan WBW",
      metricValue: "36%",
      percent: 36,
      previewOnly: true,
      title: "Faham",
      tone: "amber",
    },
    {
      ctaLabel: "Buka navigator tema",
      helper:
        "Tema patut jadi laluan sendiri, bukan ditenggelamkan di bawah Faham. Track chunk yang sudah diteroka ikut surah.",
      href: "/read/surah/2/themes",
      inside: ["Chunk", "Ayat kunci", "Alur surah"],
      metricLabel: "Contoh progress tema",
      metricValue: "22%",
      percent: 22,
      previewOnly: true,
      title: "Tema",
      tone: "indigo",
    },
    {
      ctaLabel: "Masuk papan hafal",
      helper:
        hifzSnapshot && hifzTodayTotal > 0
          ? `~${Math.ceil(hifzTodayTotal / 15)} halaman aktif hari ini merentas Sabak, Sabqi, dan Manzil. ${hifzDueTodayCount} item daripadanya sudah due sekarang.`
          : "Hafal patut kekal sebagai workspace tersendiri dengan fokus Sabak, Sabqi, dan Manzil.",
      href: "/hifz",
      inside: ["Sabak", "Sabqi", "Manzil"],
      metricLabel:
        hifzSnapshot && hifzSnapshot.totalManzil > 0
          ? `~${Math.ceil(hifzSnapshot.totalManzil / 15)} halaman sudah stabil di Manzil`
          : "Belum ada data hafalan stabil",
      metricValue: `${hifzCoveragePct}%`,
      percent: hifzCoveragePct,
      title: "Hafal",
      tone: "stone",
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <section className="animate-fade-in-up rounded-[32px] border border-stone-200/90 bg-white/82 p-5 shadow-[0_28px_90px_-48px_rgba(28,25,23,0.55)] backdrop-blur-sm sm:p-7 dark:border-stone-700 dark:bg-stone-900/78">
        <div className="grid gap-6 xl:grid-cols-[1.18fr_0.82fr]">
          <div className="space-y-6">
            <div className="inline-flex items-center rounded-full border border-teal-900/15 bg-teal-950/6 px-3 py-1 text-xs font-medium tracking-wide text-teal-900 dark:border-teal-300/20 dark:bg-teal-900/35 dark:text-teal-100">
              Visual Proposal · Dashboard depan rumah
            </div>

            <div className="space-y-3">
              <h1 className="max-w-3xl text-4xl font-medium leading-tight tracking-tight text-stone-900 sm:text-5xl dark:text-stone-50">
                Papan pemuka yang terus jawab:
                <span className="block text-teal-900 dark:text-teal-200">
                  sambung di mana, fokus apa, mode mana patut dibuka.
                </span>
              </h1>
              <p className="max-w-2xl text-base leading-relaxed text-stone-600 sm:text-lg dark:text-stone-300">
                Saya cadangkan muka depan jadi hub yang ringkas tetapi jelas.
                Reading mode kekal suci dan minimal, manakala dashboard jadi
                tempat ringkasan progres merentas Baca, Faham, Tema, dan Hafal.
              </p>
            </div>

            <div className="flex flex-wrap gap-2 text-xs text-stone-700 dark:text-stone-200">
              <span className="rounded-full border border-stone-300 bg-stone-100 px-3 py-1 dark:border-stone-600 dark:bg-stone-800">
                Baca
              </span>
              <span className="rounded-full border border-stone-300 bg-stone-100 px-3 py-1 dark:border-stone-600 dark:bg-stone-800">
                Faham
              </span>
              <span className="rounded-full border border-stone-300 bg-stone-100 px-3 py-1 dark:border-stone-600 dark:bg-stone-800">
                Tema
              </span>
              <span className="rounded-full border border-stone-300 bg-stone-100 px-3 py-1 dark:border-stone-600 dark:bg-stone-800">
                Hafal
              </span>
              <span className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-amber-900 dark:border-amber-600 dark:bg-amber-950/50 dark:text-amber-100">
                Tadabbur later
              </span>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href={`/read/${continuePage}`}
                prefetch={false}
                className="rounded-xl bg-teal-900 px-5 py-2.5 text-sm font-medium text-teal-50 transition hover:bg-teal-800 dark:bg-teal-700 dark:hover:bg-teal-600"
              >
                Masuk Baca
              </Link>
              <Link
                href="/hifz"
                className="rounded-xl border border-stone-300 bg-white px-5 py-2.5 text-sm font-medium text-stone-700 transition hover:bg-stone-100 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
              >
                Masuk Hafal
              </Link>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-stone-200/80 bg-stone-50/90 px-4 py-3 dark:border-stone-700 dark:bg-stone-900/80">
                <p className="text-xs uppercase tracking-[0.2em] text-stone-500 dark:text-stone-400">
                  Last page
                </p>
                <p className="mt-2 text-2xl font-semibold tracking-tight text-stone-900 dark:text-stone-100">
                  {readingState.lastPage ? `p. ${readingState.lastPage}` : "p. 1"}
                </p>
              </div>
              <div className="rounded-2xl border border-stone-200/80 bg-stone-50/90 px-4 py-3 dark:border-stone-700 dark:bg-stone-900/80">
                <p className="text-xs uppercase tracking-[0.2em] text-stone-500 dark:text-stone-400">
                  Bacaan terakhir
                </p>
                <p className="mt-2 text-2xl font-semibold tracking-tight text-stone-900 dark:text-stone-100">
                  {formattedLastRead}
                </p>
              </div>
              <div className="rounded-2xl border border-stone-200/80 bg-stone-50/90 px-4 py-3 dark:border-stone-700 dark:bg-stone-900/80">
                <p className="text-xs uppercase tracking-[0.2em] text-stone-500 dark:text-stone-400">
                  Due hafal
                </p>
                <p className="mt-2 text-2xl font-semibold tracking-tight text-stone-900 dark:text-stone-100">
                  {hifzDueTodayCount}
                </p>
              </div>
              <div className="rounded-2xl border border-stone-200/80 bg-stone-50/90 px-4 py-3 dark:border-stone-700 dark:bg-stone-900/80">
                <p className="text-xs uppercase tracking-[0.2em] text-stone-500 dark:text-stone-400">
                  Streak
                </p>
                <p className="mt-2 text-2xl font-semibold tracking-tight text-stone-900 dark:text-stone-100">
                  {hifzSnapshot?.streak ?? 0} hari
                </p>
              </div>
            </div>
          </div>

          <aside className="rounded-[28px] border border-stone-200/80 bg-stone-50/90 p-4 dark:border-stone-700 dark:bg-stone-950/60">
            <div className="rounded-[24px] bg-[radial-gradient(circle_at_top_left,rgba(20,94,89,0.12),transparent_48%),linear-gradient(180deg,rgba(255,255,255,0.96),rgba(245,245,244,0.92))] p-4 dark:bg-[radial-gradient(circle_at_top_left,rgba(45,212,191,0.14),transparent_48%),linear-gradient(180deg,rgba(28,25,23,0.96),rgba(12,10,9,0.92))]">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500 dark:text-stone-400">
                Cadangan flow hari ini
              </p>
              <div className="mt-5 space-y-3">
                <Link
                  href={`/read/${continuePage}`}
                  prefetch={false}
                  className="block rounded-2xl border border-teal-900/10 bg-white/92 px-4 py-4 transition hover:bg-white dark:border-teal-300/10 dark:bg-stone-900/80 dark:hover:bg-stone-900"
                >
                  <p className="text-xs uppercase tracking-[0.18em] text-stone-500 dark:text-stone-400">
                    1. Sambung baca
                  </p>
                  <p className="mt-1 text-lg font-medium text-stone-900 dark:text-stone-100">
                    {readingState.lastPage
                      ? `Teruskan di page ${readingState.lastPage}`
                      : "Mulakan dari page 1"}
                  </p>
                  <p className="mt-1 text-sm text-stone-600 dark:text-stone-300">
                    Masuk terus ke mushaf tanpa toolbar utiliti penuh di hadapan mata.
                  </p>
                </Link>

                <Link
                  href="/hifz"
                  className="block rounded-2xl border border-stone-900/8 bg-white/92 px-4 py-4 transition hover:bg-white dark:border-white/8 dark:bg-stone-900/80 dark:hover:bg-stone-900"
                >
                  <p className="text-xs uppercase tracking-[0.18em] text-stone-500 dark:text-stone-400">
                    2. Fokus hafal
                  </p>
                  <p className="mt-1 text-lg font-medium text-stone-900 dark:text-stone-100">
                    {hifzTodayTotal > 0
                      ? `~${Math.ceil(hifzTodayTotal / 15)} halaman dalam sesi hari ini`
                      : "Buka sesi Sabak, Sabqi, Manzil"}
                  </p>
                  <p className="mt-1 text-sm text-stone-600 dark:text-stone-300">
                    {hifzSnapshot?.nextAyahLabel
                      ? `Ayat seterusnya: ${hifzSnapshot.nextAyahLabel}`
                      : "Ringkasan harian dan queue review duduk di satu tempat."}
                  </p>
                </Link>

                <Link
                  href={`/read/${continuePage}`}
                  prefetch={false}
                  className="block rounded-2xl border border-stone-900/8 bg-white/92 px-4 py-4 transition hover:bg-white dark:border-white/8 dark:bg-stone-900/80 dark:hover:bg-stone-900"
                >
                  <p className="text-xs uppercase tracking-[0.18em] text-stone-500 dark:text-stone-400">
                    3. Utility layer
                  </p>
                  <p className="mt-1 text-lg font-medium text-stone-900 dark:text-stone-100">
                    Jump dan audio duduk di luar mushaf
                  </p>
                  <p className="mt-1 text-sm text-stone-600 dark:text-stone-300">
                    Saya bayangkan ia sebagai popup pada desktop dan halaman
                    perantara pada mobile supaya reading mode kekal suci.
                  </p>
                </Link>
              </div>
            </div>

            <p className="px-2 pb-1 pt-4 text-xs leading-relaxed text-stone-500 dark:text-stone-400">
              Nota: kad Baca dan Hafal menggunakan signal sebenar yang sudah ada.
              Faham dan Tema masih proposal metric. Bookmark sudah
              dikeluarkan daripada cadangan ini, dan jump/audio diposisikan
              semula sebagai utility layer.
            </p>
          </aside>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        {modeCards.map((card, index) => (
          <div key={card.title} style={{ animationDelay: `${110 + index * 70}ms` }}>
            <ModeProgressCard card={card} />
          </div>
        ))}
      </section>

      <section className="animate-fade-in-up rounded-[28px] border border-teal-900/14 bg-[linear-gradient(145deg,rgba(240,253,250,0.92),rgba(255,255,255,0.82))] p-5 shadow-[0_18px_54px_-38px_rgba(20,94,89,0.35)] backdrop-blur-sm dark:border-teal-300/18 dark:bg-[linear-gradient(145deg,rgba(15,118,110,0.2),rgba(10,10,10,0.72))]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-900 dark:text-teal-200">
              Utility layer
            </p>
            <h2 className="mt-2 text-3xl font-medium tracking-tight text-stone-900 dark:text-stone-50">
              Jump dan audio tidak duduk dalam mushaf.
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-stone-700 dark:text-stone-300">
              Saya setuju dua benda ini patut keluar daripada permukaan utama.
              Untuk desktop, ia boleh muncul sebagai popup atau slide-over.
              Untuk mobile, saya lebih suka halaman perantara yang jelas supaya
              paparan mushaf tetap bersih.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 text-xs text-teal-950 dark:text-teal-100">
            <span className="rounded-full border border-teal-900/15 bg-teal-100/85 px-3 py-1 dark:border-teal-200/18 dark:bg-teal-900/40">
              Jump to Page
            </span>
            <span className="rounded-full border border-teal-900/15 bg-teal-100/85 px-3 py-1 dark:border-teal-200/18 dark:bg-teal-900/40">
              Jump to Surah
            </span>
            <span className="rounded-full border border-teal-900/15 bg-teal-100/85 px-3 py-1 dark:border-teal-200/18 dark:bg-teal-900/40">
              Jump to Juz
            </span>
            <span className="rounded-full border border-teal-900/15 bg-teal-100/85 px-3 py-1 dark:border-teal-200/18 dark:bg-teal-900/40">
              Audio repeat
            </span>
          </div>
        </div>
      </section>

      <section className="animate-fade-in-up-delay rounded-[28px] border border-amber-200/80 bg-[linear-gradient(145deg,rgba(255,251,235,0.92),rgba(255,255,255,0.82))] p-5 shadow-[0_18px_54px_-38px_rgba(120,53,15,0.35)] backdrop-blur-sm dark:border-amber-700/30 dark:bg-[linear-gradient(145deg,rgba(120,53,15,0.2),rgba(10,10,10,0.72))]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-900 dark:text-amber-200">
              Layer kemudian
            </p>
            <h2 className="mt-2 text-3xl font-medium tracking-tight text-stone-900 dark:text-stone-50">
              Tadabbur
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-stone-700 dark:text-stone-300">
              Kalau mahu ruang untuk tafsir, hadith, dan renungan, saya rasa
              perkataan terbaik ialah <span className="font-semibold">Tadabbur</span>.
              Tetapi saya tidak akan letak ia sebagai kad utama dulu. Lebih baik
              ia muncul selepas mode Faham dan Tema sudah matang.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 text-xs text-amber-950 dark:text-amber-100">
            <span className="rounded-full border border-amber-900/15 bg-amber-100/85 px-3 py-1 dark:border-amber-200/18 dark:bg-amber-900/40">
              Tafsir ringkas
            </span>
            <span className="rounded-full border border-amber-900/15 bg-amber-100/85 px-3 py-1 dark:border-amber-200/18 dark:bg-amber-900/40">
              Hadith sokongan
            </span>
            <span className="rounded-full border border-amber-900/15 bg-amber-100/85 px-3 py-1 dark:border-amber-200/18 dark:bg-amber-900/40">
              Renungan
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
