"use client";

import Link from "next/link";
import { useState } from "react";

interface ThemeActionPanelProps {
  ayahIds: number[];
  fahamHref: string;
  firstPageHref: string;
  firstPageNumber: number;
  isAuthenticated: boolean;
  rangeLabel: string;
  signInHref: string;
}

export function ThemeActionPanel({
  ayahIds,
  fahamHref,
  firstPageHref,
  firstPageNumber,
  isAuthenticated,
  rangeLabel,
  signInHref,
}: ThemeActionPanelProps) {
  const [isSavingMurajaah, setIsSavingMurajaah] = useState(false);
  const [murajaahMessage, setMurajaahMessage] = useState<string | null>(null);
  const [murajaahError, setMurajaahError] = useState<string | null>(null);
  const [showReflection, setShowReflection] = useState(false);

  const handleSaveMurajaah = async () => {
    if (isSavingMurajaah || ayahIds.length === 0) {
      return;
    }

    setIsSavingMurajaah(true);
    setMurajaahError(null);
    setMurajaahMessage(null);

    try {
      const response = await fetch("/api/hifz/mark-memorized", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ayahIds }),
      });

      if (!response.ok) {
        throw new Error("SAVE_FAILED");
      }

      setMurajaahMessage(
        `${ayahIds.length} ayat daripada ${rangeLabel} telah ditambah ke murajaah.`,
      );
    } catch {
      setMurajaahError("Tak dapat simpan ke murajaah sekarang. Cuba sekali lagi.");
    } finally {
      setIsSavingMurajaah(false);
    }
  };

  return (
    <section className="rounded-[1.9rem] border border-stone-200/85 bg-[linear-gradient(135deg,rgba(255,251,235,0.9),rgba(255,255,255,0.96))] p-5 shadow-[0_28px_80px_-52px_rgba(120,53,15,0.42)] dark:border-stone-700/80 dark:bg-[linear-gradient(135deg,rgba(68,64,60,0.72),rgba(12,10,9,0.92))] sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <span className="inline-flex rounded-full border border-amber-300/80 bg-white/75 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-amber-800 dark:border-amber-500/30 dark:bg-amber-950/35 dark:text-amber-200">
            Sambung Selepas Tema
          </span>
          <h3 className="mt-3 text-xl font-medium tracking-tight text-stone-900 dark:text-stone-50">
            Jadikan tema ini pintu masuk kepada amal harian.
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-stone-600 dark:text-stone-300">
            Pilih satu tindakan sahaja sudah memadai. Miftah akan guna jejak ini
            untuk membawa anda daripada teroka tema kepada faham dan murajaah.
          </p>
        </div>

        <span className="rounded-full border border-stone-300/80 bg-white/80 px-3 py-1 text-sm text-stone-700 dark:border-stone-600 dark:bg-stone-900/70 dark:text-stone-200">
          Ayat {rangeLabel}
        </span>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-3">
        <article className="rounded-[1.4rem] border border-indigo-200/80 bg-indigo-50/75 p-4 dark:border-indigo-500/25 dark:bg-indigo-950/25">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-indigo-700 dark:text-indigo-300">
            Faham
          </p>
          <h4 className="mt-2 text-lg font-medium text-stone-900 dark:text-stone-50">
            Tambah ke Faham
          </h4>
          <p className="mt-2 text-sm leading-relaxed text-stone-600 dark:text-stone-300">
            Buka deck yang mengutamakan perkataan daripada chunk ini dahulu.
          </p>
          <Link
            href={fahamHref}
            className="mt-4 inline-flex items-center justify-center rounded-full bg-indigo-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-800 dark:bg-indigo-100 dark:text-indigo-950 dark:hover:bg-white"
          >
            Buka Faham Bertema
          </Link>
        </article>

        <article className="rounded-[1.4rem] border border-teal-200/80 bg-teal-50/75 p-4 dark:border-teal-500/25 dark:bg-teal-950/25">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-700 dark:text-teal-300">
            Murajaah
          </p>
          <h4 className="mt-2 text-lg font-medium text-stone-900 dark:text-stone-50">
            Simpan untuk murajaah
          </h4>
          <p className="mt-2 text-sm leading-relaxed text-stone-600 dark:text-stone-300">
            Tambahkan semua ayat dalam bahagian ini ke aliran Hafal supaya ia
            masuk ke sabqi dan ulangan seterusnya.
          </p>
          {isAuthenticated ? (
            <button
              type="button"
              onClick={handleSaveMurajaah}
              disabled={isSavingMurajaah || ayahIds.length === 0}
              className="mt-4 inline-flex items-center justify-center rounded-full bg-teal-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-teal-100 dark:text-teal-950 dark:hover:bg-white"
            >
              {isSavingMurajaah ? "Menyimpan..." : "Simpan ke Murajaah"}
            </button>
          ) : (
            <Link
              href={signInHref}
              className="mt-4 inline-flex items-center justify-center rounded-full border border-teal-300 bg-white px-4 py-2 text-sm font-medium text-teal-900 transition hover:bg-teal-50 dark:border-teal-500/40 dark:bg-stone-900 dark:text-teal-100 dark:hover:bg-teal-950/35"
            >
              Masuk untuk simpan
            </Link>
          )}
        </article>

        <article className="rounded-[1.4rem] border border-amber-200/80 bg-amber-50/75 p-4 dark:border-amber-500/25 dark:bg-amber-950/20">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-700 dark:text-amber-300">
            Renung
          </p>
          <h4 className="mt-2 text-lg font-medium text-stone-900 dark:text-stone-50">
            Renungi tema ini hari ini
          </h4>
          <p className="mt-2 text-sm leading-relaxed text-stone-600 dark:text-stone-300">
            Ambil satu soalan ringkas, kemudian baca semula halaman awal tema
            ini dengan niat yang lebih jelas.
          </p>
          <button
            type="button"
            onClick={() => setShowReflection((value) => !value)}
            className="mt-4 inline-flex items-center justify-center rounded-full border border-amber-300 bg-white px-4 py-2 text-sm font-medium text-amber-900 transition hover:bg-amber-100 dark:border-amber-500/40 dark:bg-stone-900 dark:text-amber-100 dark:hover:bg-amber-950/35"
          >
            {showReflection ? "Sembunyikan prompt" : "Buka prompt renungan"}
          </button>
        </article>
      </div>

      {murajaahMessage ? (
        <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-950/25 dark:text-emerald-100">
          <p>{murajaahMessage}</p>
          <div>
            <Link
              href="/hifz"
              className="inline-flex items-center rounded-full border border-emerald-300 bg-white px-4 py-2 font-medium text-emerald-900 transition hover:bg-emerald-100 dark:border-emerald-500/40 dark:bg-stone-900 dark:text-emerald-100 dark:hover:bg-emerald-950/35"
            >
              Buka Hafal
            </Link>
          </div>
        </div>
      ) : null}

      {murajaahError ? (
        <p className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-950/25 dark:text-rose-200">
          {murajaahError}
        </p>
      ) : null}

      {showReflection ? (
        <div className="mt-4 rounded-[1.5rem] border border-stone-200/80 bg-white/80 p-4 dark:border-stone-700 dark:bg-stone-950/45">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-stone-500 dark:text-stone-400">
            Prompt hari ini
          </p>
          <p className="mt-2 text-sm leading-relaxed text-stone-700 dark:text-stone-200">
            Daripada ayat {rangeLabel}, apakah satu sikap, doa, atau amaran yang
            paling patut saya bawa masuk ke bacaan dan tindakan saya hari ini?
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Link
              href={firstPageHref}
              className="inline-flex items-center rounded-full bg-stone-900 px-4 py-2 text-sm font-medium text-stone-50 transition hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white"
            >
              Baca semula dari halaman {firstPageNumber}
            </Link>
            <span className="text-sm text-stone-500 dark:text-stone-400">
              Tidak perlu panjang. Satu niat yang jelas sudah cukup.
            </span>
          </div>
        </div>
      ) : null}
    </section>
  );
}
