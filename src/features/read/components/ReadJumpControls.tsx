"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  JuzJumpTarget,
  ReadJumpTargets,
  SurahJumpTarget,
} from "@/lib/readNavigation";
import {
  getMarkerPageById,
  parseBoundedIntegerInput,
} from "../domain/readNavigationUtils";
import { navigateWithOfflineSupport } from "@/lib/pwa/navigation";
import { FALLBACK_READ_JUMP_TARGETS } from "../domain/readJumpTargetsFallback";

interface ReadJumpControlsProps {
  currentPage: number;
  currentSurahId: number;
  currentJuzNumber: number;
  surahOptions?: SurahJumpTarget[];
  juzOptions?: JuzJumpTarget[];
}

export function ReadJumpControls({
  currentPage,
  currentSurahId,
  currentJuzNumber,
  surahOptions: initialSurahOptions,
  juzOptions: initialJuzOptions,
}: ReadJumpControlsProps) {
  const router = useRouter();
  const hasFallbackTargets =
    FALLBACK_READ_JUMP_TARGETS.surahs.length > 0 &&
    FALLBACK_READ_JUMP_TARGETS.juzs.length > 0;
  const [pageInput, setPageInput] = useState(String(currentPage));
  const [surahInput, setSurahInput] = useState(String(currentSurahId));
  const [juzInput, setJuzInput] = useState(String(currentJuzNumber));
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [surahOptions, setSurahOptions] = useState<SurahJumpTarget[]>(
    initialSurahOptions ?? FALLBACK_READ_JUMP_TARGETS.surahs,
  );
  const [juzOptions, setJuzOptions] = useState<JuzJumpTarget[]>(
    initialJuzOptions ?? FALLBACK_READ_JUMP_TARGETS.juzs,
  );
  const [isLoadingTargets, setIsLoadingTargets] = useState(
    (!initialSurahOptions || !initialJuzOptions) && !hasFallbackTargets,
  );
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (initialSurahOptions && initialJuzOptions) {
      return;
    }

    if (!navigator.onLine && hasFallbackTargets) {
      return;
    }

    const abortController = new AbortController();

    if (!hasFallbackTargets) {
      setTimeout(() => setIsLoadingTargets(true), 0);
    }
    setTimeout(() => setLoadError(null), 0);

    void fetch("/api/read/jump-targets", {
      signal: abortController.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Jump target request failed");
        }

        return (await response.json()) as ReadJumpTargets;
      })
      .then((payload) => {
        setSurahOptions(payload.surahs);
        setJuzOptions(payload.juzs);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        console.error("[ReadJumpControls] Failed to load jump targets", error);

        if (hasFallbackTargets) {
          setSurahOptions(FALLBACK_READ_JUMP_TARGETS.surahs);
          setJuzOptions(FALLBACK_READ_JUMP_TARGETS.juzs);
          setLoadError(null);
          return;
        }

        setLoadError("Senarai surah dan juz belum dapat dimuatkan.");
      })
      .finally(() => {
        if (!abortController.signal.aborted) {
          setIsLoadingTargets(false);
        }
      });

    return () => {
      abortController.abort();
    };
  }, [hasFallbackTargets, initialJuzOptions, initialSurahOptions]);

  const surahMarkers = useMemo(
    () =>
      surahOptions.map((option) => ({
        id: option.surah,
        page: option.page,
      })),
    [surahOptions],
  );
  const juzMarkers = useMemo(
    () =>
      juzOptions.map((option) => ({
        id: option.juz,
        page: option.page,
      })),
    [juzOptions],
  );

  function jumpToPage(page: number) {
    setErrorMessage(null);
    navigateWithOfflineSupport(router, `/read/${page}`);
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
            if (isLoadingTargets || surahOptions.length === 0) {
              setErrorMessage("Senarai surah sedang dimuatkan.");
              return;
            }
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
                if (isLoadingTargets || surahOptions.length === 0) {
                  return;
                }
                const surahId = parseBoundedIntegerInput(value, 1, 114);
                if (surahId) {
                  const targetPage = getMarkerPageById(surahMarkers, surahId);
                  if (targetPage) jumpToPage(targetPage);
                }
              }}
              disabled={isLoadingTargets || surahOptions.length === 0}
              className="mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus:border-stone-500 sm:text-base dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100 dark:focus:border-stone-400"
            >
              {isLoadingTargets ? (
                <option value={surahInput}>Memuatkan senarai surah...</option>
              ) : null}
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
            if (isLoadingTargets || juzOptions.length === 0) {
              setErrorMessage("Senarai juz sedang dimuatkan.");
              return;
            }
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
                if (isLoadingTargets || juzOptions.length === 0) {
                  return;
                }
                const juzNumber = parseBoundedIntegerInput(value, 1, 30);
                if (juzNumber) {
                  const targetPage = getMarkerPageById(juzMarkers, juzNumber);
                  if (targetPage) jumpToPage(targetPage);
                }
              }}
              disabled={isLoadingTargets || juzOptions.length === 0}
              className="mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus:border-stone-500 sm:text-base dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100 dark:focus:border-stone-400"
            >
              {isLoadingTargets ? (
                <option value={juzInput}>Memuatkan senarai juz...</option>
              ) : null}
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
      {!errorMessage && loadError ? (
        <p className="mt-3 text-sm text-rose-700 dark:text-rose-400">{loadError}</p>
      ) : null}
    </section>
  );
}
