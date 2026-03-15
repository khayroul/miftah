"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  areAllProgressIdsRated,
  buildQueuePageHref,
  loadQueue,
  advanceQueue,
  markRated,
  getItemsForPage,
  isQueueComplete,
  clearQueue,
} from "@/lib/hifz/sessionQueue";
import { buildSignInPath } from "@/lib/auth";
import type { HifzFlowType } from "@/lib/hifz/sessionQueue";
import { TasmiSessionUI, type AyahRange } from "@/components/TasmiSessionUI";
import { createSupabaseBrowserClient } from "@/lib/supabase-auth";
import type { TasmiSessionResult } from "@/lib/tasmi/tasmi-session";
import type { TasmiRatingLabel } from "@/lib/tasmi/fsrs-bridge";
import { saveResumePoint, clearResumePoint } from "@/lib/hifz/resumePoint";

interface HifzInlineRatingProps {
  flowType: HifzFlowType;
  pageNumber: number;
  queueIndex?: number;
  visible: boolean;
  /** Called when tasmi' completes successfully (non-ulang) — parent can auto-reveal the veil. */
  onTasmiSuccess?: () => void;
  onSessionComplete?: () => void;
  onPageComplete?: () => void;
}

interface FlowErrorState {
  message: string;
  requiresSignIn?: boolean;
  continueHref?: string;
  continueLabel?: string;
}

interface RateBatchResponse {
  error?: string;
  ok?: boolean;
  results?: Array<{ ok: boolean; progressId: number }>;
}

export function HifzInlineRating({
  flowType,
  pageNumber,
  queueIndex = 0,
  visible,
  onTasmiSuccess,
  onSessionComplete,
  onPageComplete,
}: HifzInlineRatingProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [complete, setComplete] = useState(false);
  const [errorState, setErrorState] = useState<FlowErrorState | null>(null);
  const [tasmiActive, setTasmiActive] = useState(false);
  const [tasmiExpectedText, setTasmiExpectedText] = useState<string | null>(null);
  const [tasmiSurahNumber, setTasmiSurahNumber] = useState(0);
  const [tasmiStartAyah, setTasmiStartAyah] = useState(0);
  const [tasmiEndAyah, setTasmiEndAyah] = useState(0);
  const [tasmiAyahRanges, setTasmiAyahRanges] = useState<AyahRange[]>([]);
  const [tasmiLoading, setTasmiLoading] = useState(false);

  useEffect(() => {
    if (!complete && !errorState) {
      saveResumePoint({ flow: flowType, pageNumber, queueIndex });
    }
  }, [complete, errorState, flowType, pageNumber, queueIndex]);

  const buildAlreadyRatedState = useCallback(
    (queuePageIndex: number, activePageNumber: number | undefined): FlowErrorState => ({
      message:
        activePageNumber && activePageNumber !== pageNumber
          ? "Halaman ini sudah ditandakan dalam sesi semasa. Sambung pada halaman aktif untuk elak rekod berganda."
          : "Halaman ini sudah ditandakan dalam sesi semasa.",
      continueHref:
        activePageNumber && activePageNumber !== pageNumber
          ? buildQueuePageHref(flowType, activePageNumber, queuePageIndex)
          : undefined,
      continueLabel: "Teruskan Sesi",
    }),
    [flowType, pageNumber],
  );
  const initialFlowError = useMemo<FlowErrorState | null>(() => {
    const queue = loadQueue(flowType);
    if (!queue) {
      return {
        message: "Sesi hafalan ini sudah tamat atau hilang. Buka semula dari Hafal.",
      };
    }

    const pageItems = getItemsForPage(queue, pageNumber);
    if (pageItems.length === 0) {
      return {
        message: "Halaman ini tiada dalam sesi hafalan semasa. Kembali ke Hafal untuk sambung semula.",
      };
    }

    if (areAllProgressIdsRated(queue, pageItems.map((item) => item.progressId))) {
      return buildAlreadyRatedState(
        queue.currentPageIndex,
        queue.pageOrder[queue.currentPageIndex],
      );
    }

    return null;
  }, [buildAlreadyRatedState, flowType, pageNumber]);
  const displayedError: FlowErrorState | null = errorState ?? initialFlowError;

  const startTasmi = useCallback(async () => {
    const queue = loadQueue(flowType);
    if (!queue) return;

    const pageItems = getItemsForPage(queue, pageNumber);
    if (pageItems.length === 0) return;

    setTasmiLoading(true);
    try {
      const ayahKeys = pageItems.map((item) => item.ayahKey);
      const parsed = ayahKeys.map((key) => {
        const [surah, ayah] = key.split(":").map(Number);
        return { surah: surah ?? 0, ayah: ayah ?? 0 };
      });

      const surahNumber = parsed[0]?.surah ?? 0;
      const startAyah = parsed[0]?.ayah ?? 0;
      const endAyah = parsed[parsed.length - 1]?.ayah ?? startAyah;

      const supabase = createSupabaseBrowserClient();
      const ayahIds = pageItems.map((item) => item.ayahId);
      const { data: ayahRows } = await supabase
        .from("ayat")
        .select("id, surah_id, ayah_number, text_simple")
        .in("id", ayahIds)
        .order("surah_id")
        .order("ayah_number");

      if (!ayahRows || ayahRows.length === 0) {
        setTasmiLoading(false);
        return;
      }

      const expectedText = ayahRows.map((row) => row.text_simple).join(" ");

      // Build per-ayah word ranges for talqin resolution
      let wordOffset = 0;
      const ranges: AyahRange[] = ayahRows.map((row) => {
        const wordCount = row.text_simple.split(/\s+/).filter(Boolean).length;
        const range: AyahRange = {
          surah: row.surah_id,
          ayah: row.ayah_number,
          startWordIndex: wordOffset,
          endWordIndex: wordOffset + wordCount - 1,
        };
        wordOffset += wordCount;
        return range;
      });

      setTasmiExpectedText(expectedText);
      setTasmiAyahRanges(ranges);
      setTasmiSurahNumber(surahNumber);
      setTasmiStartAyah(startAyah);
      setTasmiEndAyah(endAyah);
      setTasmiActive(true);
    } catch {
      // Failed to fetch — stay on manual mode
    }
    setTasmiLoading(false);
  }, [flowType, pageNumber]);

  const handleTasmiCancel = useCallback(() => {
    setTasmiActive(false);
    setTasmiExpectedText(null);
  }, []);

  const handleRate = useCallback(
    async (rating: 1 | 3) => {
      setSubmitting(true);
      setErrorState(null);
      try {
        const queue = loadQueue(flowType);
        if (!queue) {
          setErrorState({
            message: "Sesi hafalan ini sudah tamat atau hilang. Buka semula dari Hafal.",
          });
          setSubmitting(false);
          return;
        }

        const pageItems = getItemsForPage(queue, pageNumber);
        if (pageItems.length === 0) {
          setErrorState({
            message: "Halaman ini tiada dalam sesi hafalan semasa. Kembali ke Hafal untuk sambung semula.",
          });
          setSubmitting(false);
          return;
        }

        if (areAllProgressIdsRated(queue, pageItems.map((item) => item.progressId))) {
          setErrorState(
            buildAlreadyRatedState(
              queue.currentPageIndex,
              queue.pageOrder[queue.currentPageIndex],
            ),
          );
          setSubmitting(false);
          return;
        }

        const ratings = pageItems.map((item) => ({
          progressId: item.progressId,
          rating,
          block: item.block,
        }));

        const response = await fetch("/api/hifz/rate-batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ratings }),
        });
        const payload = (await response.json().catch(() => null)) as
          | RateBatchResponse
          | null;

        if (
          !response.ok ||
          payload?.ok !== true ||
          payload.results?.some((entry) => entry.ok !== true)
        ) {
          setErrorState(
            response.status === 401
              ? {
                  message: "Sesi hafalan perlukan akaun aktif. Log masuk dahulu kemudian buka semula dari Hafal.",
                  requiresSignIn: true,
                }
              : {
                  message:
                    payload?.error ??
                    "Markah hafalan tak dapat disimpan sekarang. Cuba lagi sekali.",
                },
          );
          setSubmitting(false);
          return;
        }

        markRated(
          flowType,
          pageItems.map((item) => item.progressId),
        );

        const updated = advanceQueue(flowType);
        if (!updated) {
          setErrorState({
            message: "Sesi hafalan tak dapat disambung. Kembali ke Hafal dan buka semula sesi ini.",
          });
          setSubmitting(false);
          return;
        }

        if (isQueueComplete(updated)) {
          clearQueue(flowType);
          clearResumePoint();
          setComplete(true);
          setSubmitting(false);
          onSessionComplete?.();
          return;
        }

        onPageComplete?.();
        const nextPage = updated.pageOrder[updated.currentPageIndex];
        router.push(
          buildQueuePageHref(flowType, nextPage, updated.currentPageIndex),
        );
      } catch {
        setErrorState({
          message: "Simpanan hafalan gagal sekarang. Cuba lagi sekali.",
        });
        setSubmitting(false);
      }
    },
    [buildAlreadyRatedState, flowType, pageNumber, router],
  );

  const handleTasmiEnd = useCallback(
    async (_result: TasmiSessionResult, label: TasmiRatingLabel) => {
      setTasmiActive(false);
      setTasmiExpectedText(null);
      const binaryRating = label === "ulang" ? (1 as const) : (3 as const);
      if (label !== "ulang") {
        onTasmiSuccess?.();
      }
      await handleRate(binaryRating);
    },
    [handleRate, onTasmiSuccess],
  );

  // Always show when tasmi is active, complete, or has an error.
  // When veil is still up (!visible), show only the tasmi button.
  const showTasmiOnly = !visible && !tasmiActive && !complete && !displayedError;

  if (complete) {
    return (
      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-stone-200 bg-white/95 px-4 py-6 text-center shadow-lg backdrop-blur-md dark:border-stone-700 dark:bg-stone-900/95">
        <p className="mb-1 text-xl font-bold text-stone-900 dark:text-stone-100">
          Alhamdulillah
        </p>
        <p className="mb-4 text-sm text-stone-500 dark:text-stone-400">
          Sesi {flowType === "memorize" ? "hafalan" : "ulangan"} selesai!
        </p>
        <a
          href="/hifz"
          className="inline-flex items-center rounded-xl bg-teal-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700 dark:bg-teal-600 dark:hover:bg-teal-500"
        >
          Kembali ke Hafal
        </a>
      </div>
    );
  }

  if (displayedError) {
    return (
      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-rose-200 bg-white/95 px-4 py-5 text-center shadow-lg backdrop-blur-md dark:border-rose-900/40 dark:bg-stone-900/95">
        <p className="mb-2 text-sm font-semibold text-rose-700 dark:text-rose-300">
          Sesi tergendala
        </p>
        <p className="mx-auto mb-4 max-w-xl text-sm text-stone-600 dark:text-stone-300">
          {displayedError.message}
        </p>
        <div className="flex justify-center gap-3">
          {displayedError.continueHref ? (
            <a
              href={displayedError.continueHref}
              className="inline-flex items-center rounded-xl bg-teal-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700 dark:bg-teal-600 dark:hover:bg-teal-500"
            >
              {displayedError.continueLabel ?? "Teruskan Sesi"}
            </a>
          ) : null}
          {displayedError.requiresSignIn ? (
            <a
              href={buildSignInPath("/hifz")}
              className="inline-flex items-center rounded-xl bg-teal-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700 dark:bg-teal-600 dark:hover:bg-teal-500"
            >
              Log Masuk
            </a>
          ) : null}
          <a
            href="/hifz"
            className="inline-flex items-center rounded-xl border border-stone-300 bg-white px-5 py-3 text-sm font-semibold text-stone-700 shadow-sm transition hover:bg-stone-50 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700"
          >
            Kembali ke Hafal
          </a>
        </div>
      </div>
    );
  }

  if (tasmiActive && tasmiExpectedText) {
    return (
      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-stone-200 bg-white/95 px-4 py-4 shadow-lg backdrop-blur-md dark:border-stone-700 dark:bg-stone-900/95">
        <TasmiSessionUI
          expectedText={tasmiExpectedText}
          surahNumber={tasmiSurahNumber}
          startAyah={tasmiStartAyah}
          endAyah={tasmiEndAyah}
          ayahRanges={tasmiAyahRanges}
          onSessionEnd={handleTasmiEnd}
          onCancel={handleTasmiCancel}
        />
      </div>
    );
  }

  if (showTasmiOnly) {
    return (
      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-stone-200 bg-white/95 px-4 py-4 shadow-lg backdrop-blur-md dark:border-stone-700 dark:bg-stone-900/95">
        <p className="mb-3 text-center text-sm font-medium text-stone-600 dark:text-stone-400">
          Baca tanpa melihat, atau mulakan tasmi&rsquo;
        </p>
        <div className="flex justify-center">
          <button
            type="button"
            disabled={tasmiLoading}
            onClick={startTasmi}
            className="rounded-xl bg-rose-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-700 disabled:opacity-50"
          >
            {tasmiLoading ? "Menyediakan..." : "Mula Tasmi\u2019"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-stone-200 bg-white/95 px-4 py-4 shadow-lg backdrop-blur-md dark:border-stone-700 dark:bg-stone-900/95">
      <p className="mb-3 text-center text-sm font-medium text-stone-600 dark:text-stone-400">
        Bagaimana hafalan halaman ini?
      </p>
      <div className="flex justify-center gap-3">
        <button
          type="button"
          disabled={submitting}
          onClick={() => handleRate(3)}
          className="flex-1 max-w-[200px] rounded-xl bg-teal-600 px-6 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-teal-700 disabled:opacity-50 dark:bg-teal-600 dark:hover:bg-teal-500"
        >
          Hafal
        </button>
        <button
          type="button"
          disabled={submitting}
          onClick={() => handleRate(1)}
          className="flex-1 max-w-[200px] rounded-xl bg-red-500 px-6 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-red-600 disabled:opacity-50 dark:bg-red-600 dark:hover:bg-red-500"
        >
          Lupa
        </button>
      </div>
      <div className="mt-3 flex justify-center">
        <button
          type="button"
          disabled={tasmiLoading || submitting}
          onClick={startTasmi}
          className="rounded-xl bg-rose-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-700 disabled:opacity-50"
        >
          {tasmiLoading ? "Menyediakan..." : "Mula Tasmi\u2019"}
        </button>
      </div>
    </div>
  );
}
