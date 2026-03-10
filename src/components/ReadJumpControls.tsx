"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  getMarkerPageById,
  parseBoundedIntegerInput,
} from "@/lib/readNavigationUtils";

interface SurahOption {
  surah: number;
  name: string;
  page: number;
}

interface JuzOption {
  juz: number;
  page: number;
}

interface ReadJumpControlsProps {
  currentPage: number;
  currentSurahId: number;
  currentJuzNumber: number;
  surahOptions: SurahOption[];
  juzOptions: JuzOption[];
}

export function ReadJumpControls({
  currentPage,
  currentSurahId,
  currentJuzNumber,
  surahOptions,
  juzOptions,
}: ReadJumpControlsProps) {
  const router = useRouter();
  const [pageInput, setPageInput] = useState(String(currentPage));
  const [surahInput, setSurahInput] = useState(String(currentSurahId));
  const [juzInput, setJuzInput] = useState(String(currentJuzNumber));
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const surahMarkers = surahOptions.map((option) => ({
    id: option.surah,
    page: option.page,
  }));
  const juzMarkers = juzOptions.map((option) => ({
    id: option.juz,
    page: option.page,
  }));

  function jumpToPage(page: number) {
    setErrorMessage(null);
    router.push(`/read/${page}`);
  }

  return (
    <section className="rounded-2xl border border-stone-300 bg-white px-3 py-3 shadow-sm sm:px-4 dark:border-stone-600 dark:bg-stone-900">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-stone-500 dark:text-stone-400">
        Lompat Ke
      </p>
      <div className="grid gap-2 sm:grid-cols-3">
        <form
          className="flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const targetPage = parseBoundedIntegerInput(pageInput, 1, 604);
            if (!targetPage) {
              setErrorMessage("Halaman mesti antara 1 hingga 604.");
              return;
            }
            jumpToPage(targetPage);
          }}
        >
          <label className="min-w-0 flex-1 text-xs text-stone-600 dark:text-stone-300">
            Halaman
            <input
              value={pageInput}
              onChange={(event) => setPageInput(event.target.value)}
              inputMode="numeric"
              pattern="[0-9]*"
              className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-sm text-stone-900 outline-none focus:border-stone-500 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100 dark:focus:border-stone-400"
              placeholder="1-604"
            />
          </label>
          <button
            type="submit"
            className="rounded-lg border border-stone-300 px-2.5 py-1.5 text-sm text-stone-700 transition hover:bg-stone-100 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-800"
          >
            Buka
          </button>
        </form>

        <form
          className="flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const surahId = parseBoundedIntegerInput(surahInput, 1, 114);
            if (!surahId) {
              setErrorMessage("Surah mesti antara 1 hingga 114.");
              return;
            }

            const targetPage = getMarkerPageById(surahMarkers, surahId);
            if (!targetPage) {
              setErrorMessage("Tidak jumpa halaman untuk surah itu.");
              return;
            }

            jumpToPage(targetPage);
          }}
        >
          <label className="min-w-0 flex-1 text-xs text-stone-600 dark:text-stone-300">
            Surah
            <select
              value={surahInput}
              onChange={(event) => setSurahInput(event.target.value)}
              className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-sm text-stone-900 outline-none focus:border-stone-500 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100 dark:focus:border-stone-400"
            >
              {surahOptions.map((option) => (
                <option key={option.surah} value={option.surah}>
                  {option.surah}. {option.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="rounded-lg border border-stone-300 px-2.5 py-1.5 text-sm text-stone-700 transition hover:bg-stone-100 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-800"
          >
            Buka
          </button>
        </form>

        <form
          className="flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const juzNumber = parseBoundedIntegerInput(juzInput, 1, 30);
            if (!juzNumber) {
              setErrorMessage("Juz mesti antara 1 hingga 30.");
              return;
            }

            const targetPage = getMarkerPageById(juzMarkers, juzNumber);
            if (!targetPage) {
              setErrorMessage("Tidak jumpa halaman untuk juz itu.");
              return;
            }

            jumpToPage(targetPage);
          }}
        >
          <label className="min-w-0 flex-1 text-xs text-stone-600 dark:text-stone-300">
            Juz
            <select
              value={juzInput}
              onChange={(event) => setJuzInput(event.target.value)}
              className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-sm text-stone-900 outline-none focus:border-stone-500 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100 dark:focus:border-stone-400"
            >
              {juzOptions.map((option) => (
                <option key={option.juz} value={option.juz}>
                  Juz {option.juz} (p. {option.page})
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="rounded-lg border border-stone-300 px-2.5 py-1.5 text-sm text-stone-700 transition hover:bg-stone-100 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-800"
          >
            Buka
          </button>
        </form>
      </div>

      {errorMessage ? (
        <p className="mt-2 text-xs text-rose-700 dark:text-rose-400">{errorMessage}</p>
      ) : null}
    </section>
  );
}
