"use client";

import { useCallback, useMemo, useState } from "react";
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

interface HifzInlineRatingProps {
  flowType: HifzFlowType;
  pageNumber: number;
  visible: boolean;
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
  visible,
}: HifzInlineRatingProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [complete, setComplete] = useState(false);
  const [errorState, setErrorState] = useState<FlowErrorState | null>(null);
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
          setComplete(true);
          setSubmitting(false);
          return;
        }

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

  if (!visible && !complete && !displayedError) return null;

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
    </div>
  );
}
