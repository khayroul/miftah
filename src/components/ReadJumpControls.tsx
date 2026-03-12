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
    <section className="rounded-2xl border border-stone-300 bg-white px-4 py-4 shadow-sm sm:px-5 dark:border-stone-600 dark:bg-stone-900">
      <p className="mb-3 text-[13px] font-bold uppercase tracking-wide text-stone-700 sm:text-sm dark:text-stone-300">
        Lompat Ke
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
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
          <label className="min-w-0 flex-1 text-sm font-semibold text-stone-700 dark:text-stone-200">
            Halaman
            <input
              value={pageInput}
              onChange={(event) => setPageInput(event.target.value)}
              inputMode="numeric"
              pattern="[0-9]*"
              className="mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus:border-teal-500 sm:text-base dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100 dark:focus:border-teal-400"
              placeholder="1-604"
            />
          </label>
          <button
            type="submit"
            className="rounded-lg border border-teal-600 bg-teal-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:border-teal-700 hover:bg-teal-700 sm:text-base dark:border-teal-500 dark:bg-teal-500 dark:hover:bg-teal-600"
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
          <label className="min-w-0 flex-1 text-sm font-medium text-stone-600 dark:text-stone-300">
            Surah
            <select
              value={surahInput}
              onChange={(event) => {
                const value = event.target.value;
                setSurahInput(value);
                const surahId = parseBoundedIntegerInput(value, 1, 114);
                if (surahId) {
                  const targetPage = getMarkerPageById(surahMarkers, surahId);
                  if (targetPage) jumpToPage(targetPage);
                }
              }}
              className="mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus:border-stone-500 sm:text-base dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100 dark:focus:border-stone-400"
            >
              {surahOptions.map((option) => (
                <option key={option.surah} value={option.surah}>
                  {option.surah}. {option.name}
                </option>
              ))}
            </select>
          </label>
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
          <label className="min-w-0 flex-1 text-sm font-medium text-stone-600 dark:text-stone-300">
            Juz
            <select
              value={juzInput}
              onChange={(event) => {
                const value = event.target.value;
                setJuzInput(value);
                const juzNumber = parseBoundedIntegerInput(value, 1, 30);
                if (juzNumber) {
                  const targetPage = getMarkerPageById(juzMarkers, juzNumber);
                  if (targetPage) jumpToPage(targetPage);
                }
              }}
              className="mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus:border-stone-500 sm:text-base dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100 dark:focus:border-stone-400"
            >
              {juzOptions.map((option) => (
                <option key={option.juz} value={option.juz}>
                  Juz {option.juz} (p. {option.page})
                </option>
              ))}
            </select>
          </label>
        </form>
      </div>

      {errorMessage ? (
        <p className="mt-3 text-sm text-rose-700 dark:text-rose-400">{errorMessage}</p>
      ) : null}
    </section>
  );
}
