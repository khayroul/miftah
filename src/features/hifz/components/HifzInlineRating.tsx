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
} from "../domain/sessionQueue";
import type { HifzFlowType } from "../domain/sessionQueue";
import {
  type AyahRange,
  type TasmiRatingLabel,
  type TasmiSessionResult,
} from "@/features/tasmi";
import { saveResumePoint, clearResumePoint } from "../domain/resumePoint";
import { loadHifzTasmiText } from "../domain/tasmiText";
import {
  isCompleteRateBatchResponse,
  type RateBatchResponsePayload,
} from "../domain/rateBatchResponse";
import {
  HifzInlineRatingView,
  type HifzInlineRatingError,
} from "./HifzInlineRatingView";

interface HifzInlineRatingProps {
  flowType: HifzFlowType;
  pageNumber: number;
  queueIndex?: number;
  visible: boolean;
  bottomOffsetPx?: number;
  /** Called when tasmi' completes successfully (non-ulang) — parent can auto-reveal the veil. */
  onTasmiSuccess?: () => void;
  onSessionComplete?: () => void;
  onPageComplete?: () => void;
}

export function HifzInlineRating({
  flowType,
  pageNumber,
  queueIndex = 0,
  visible,
  bottomOffsetPx = 0,
  onTasmiSuccess,
  onSessionComplete,
  onPageComplete,
}: HifzInlineRatingProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [complete, setComplete] = useState(false);
  const [errorState, setErrorState] = useState<HifzInlineRatingError | null>(null);
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
    (queuePageIndex: number, activePageNumber: number | undefined): HifzInlineRatingError => ({
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
  const initialFlowError = useMemo<HifzInlineRatingError | null>(() => {
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
  const displayedError: HifzInlineRatingError | null = errorState ?? initialFlowError;

  const startTasmi = useCallback(async () => {
    const queue = loadQueue(flowType);
    if (!queue) return;

    const pageItems = getItemsForPage(queue, pageNumber);
    if (pageItems.length === 0) return;

    setTasmiLoading(true);
    try {
      const ayahIds = pageItems.map((item) => item.ayahId);
      const tasmiText = await loadHifzTasmiText(ayahIds);
      if (!tasmiText) {
        setTasmiLoading(false);
        return;
      }
      setTasmiExpectedText(tasmiText.expectedText);
      setTasmiAyahRanges(tasmiText.ayahRanges);
      setTasmiSurahNumber(tasmiText.surahNumber);
      setTasmiStartAyah(tasmiText.startAyah);
      setTasmiEndAyah(tasmiText.endAyah);
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
          return false;
        }

        const pageItems = getItemsForPage(queue, pageNumber);
        if (pageItems.length === 0) {
          setErrorState({
            message: "Halaman ini tiada dalam sesi hafalan semasa. Kembali ke Hafal untuk sambung semula.",
          });
          setSubmitting(false);
          return false;
        }

        if (areAllProgressIdsRated(queue, pageItems.map((item) => item.progressId))) {
          setErrorState(
            buildAlreadyRatedState(
              queue.currentPageIndex,
              queue.pageOrder[queue.currentPageIndex],
            ),
          );
          setSubmitting(false);
          return false;
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
          | RateBatchResponsePayload
          | null;

        if (
          !isCompleteRateBatchResponse(
            response.ok,
            payload,
            ratings.map((entry) => entry.progressId),
          )
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
          return false;
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
          return false;
        }

        if (isQueueComplete(updated)) {
          clearQueue(flowType);
          clearResumePoint();
          setComplete(true);
          setSubmitting(false);
          onSessionComplete?.();
          return true;
        }

        onPageComplete?.();
        const nextPage = updated.pageOrder[updated.currentPageIndex];
        router.push(
          buildQueuePageHref(flowType, nextPage, updated.currentPageIndex),
        );
        return true;
      } catch {
        setErrorState({
          message: "Simpanan hafalan gagal sekarang. Cuba lagi sekali.",
        });
        setSubmitting(false);
        return false;
      }
    },
    [
      buildAlreadyRatedState,
      flowType,
      onPageComplete,
      onSessionComplete,
      pageNumber,
      router,
    ],
  );
  const handleTasmiEnd = useCallback(
    async (_result: TasmiSessionResult, label: TasmiRatingLabel) => {
      setTasmiActive(false);
      setTasmiExpectedText(null);
      const binaryRating = label === "ulang" ? (1 as const) : (3 as const);
      const saved = await handleRate(binaryRating);
      if (saved && label !== "ulang") {
        onTasmiSuccess?.();
      }
    },
    [handleRate, onTasmiSuccess],
  );

  return (
    <HifzInlineRatingView
      bottomOffsetPx={bottomOffsetPx}
      complete={complete}
      error={displayedError}
      flowType={flowType}
      handleRate={handleRate}
      handleTasmiCancel={handleTasmiCancel}
      handleTasmiEnd={handleTasmiEnd}
      startTasmi={startTasmi}
      submitting={submitting}
      tasmiActive={tasmiActive}
      tasmiAyahRanges={tasmiAyahRanges}
      tasmiEndAyah={tasmiEndAyah}
      tasmiExpectedText={tasmiExpectedText}
      tasmiLoading={tasmiLoading}
      tasmiStartAyah={tasmiStartAyah}
      tasmiSurahNumber={tasmiSurahNumber}
      visible={visible}
    />
  );
}
