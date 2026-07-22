"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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
  const tErrors = useTranslations("hifz.errors");
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
          ? tErrors("alreadyMarkedOtherActive")
          : tErrors("alreadyMarkedSamePage"),
      continueHref:
        activePageNumber && activePageNumber !== pageNumber
          ? buildQueuePageHref(flowType, activePageNumber, queuePageIndex)
          : undefined,
      continueLabel: tErrors("continueSession"),
    }),
    [flowType, pageNumber, tErrors],
  );
  const initialFlowError = useMemo<HifzInlineRatingError | null>(() => {
    const queue = loadQueue(flowType);
    if (!queue) {
      return {
        message: tErrors("sessionExpired"),
      };
    }

    const pageItems = getItemsForPage(queue, pageNumber);
    if (pageItems.length === 0) {
      return {
        message: tErrors("pageNotInSession"),
      };
    }

    if (areAllProgressIdsRated(queue, pageItems.map((item) => item.progressId))) {
      return buildAlreadyRatedState(
        queue.currentPageIndex,
        queue.pageOrder[queue.currentPageIndex],
      );
    }

    return null;
  }, [buildAlreadyRatedState, flowType, pageNumber, tErrors]);
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
            message: tErrors("sessionExpired"),
          });
          setSubmitting(false);
          return false;
        }

        const pageItems = getItemsForPage(queue, pageNumber);
        if (pageItems.length === 0) {
          setErrorState({
            message: tErrors("pageNotInSession"),
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
                  message: tErrors("signInRequired"),
                  requiresSignIn: true,
                }
              : {
                  message: payload?.error ?? tErrors("ratingSaveFailed"),
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
            message: tErrors("queueAdvanceFailed"),
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
          message: tErrors("saveFailedGeneric"),
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
      tErrors,
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
