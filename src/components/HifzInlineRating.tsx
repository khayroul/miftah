"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import {
  loadQueue,
  advanceQueue,
  markRated,
  getItemsForPage,
  isQueueComplete,
  clearQueue,
} from "@/lib/hifz/sessionQueue";
import type { HifzFlowType } from "@/lib/hifz/sessionQueue";

interface HifzInlineRatingProps {
  flowType: HifzFlowType;
  pageNumber: number;
  visible: boolean;
}

export function HifzInlineRating({
  flowType,
  pageNumber,
  visible,
}: HifzInlineRatingProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [complete, setComplete] = useState(false);

  const handleRate = useCallback(
    async (rating: 1 | 3) => {
      setSubmitting(true);
      try {
        const queue = loadQueue(flowType);
        if (!queue) {
          setSubmitting(false);
          return;
        }

        const pageItems = getItemsForPage(queue, pageNumber);
        if (pageItems.length > 0) {
          const ratings = pageItems.map((item) => ({
            progressId: item.progressId,
            rating,
            block: item.block,
          }));

          await fetch("/api/hifz/rate-batch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ratings }),
          });

          markRated(
            flowType,
            pageItems.map((item) => item.progressId),
          );
        }

        const updated = advanceQueue(flowType);
        if (!updated || isQueueComplete(updated)) {
          clearQueue(flowType);
          setComplete(true);
          setSubmitting(false);
          return;
        }

        const nextPage = updated.pageOrder[updated.currentPageIndex];
        router.push(`/read/${nextPage}?flow=${flowType}&qi=${updated.currentPageIndex}`);
      } catch {
        setSubmitting(false);
      }
    },
    [flowType, pageNumber, router],
  );

  if (!visible && !complete) return null;

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
