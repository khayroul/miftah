"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import type { AyahRange, TasmiRatingLabel, TasmiSessionResult } from "@/features/tasmi";
import {
  advanceQueue,
  areAllProgressIdsRated,
  buildQueuePageHref,
  clearQueue,
  isQueueComplete,
  loadQueue,
  markRated,
} from "../domain/sessionQueue";
import {
  getChunkSizeSuggestion,
  recordChunkRating,
  type ChunkSizeSuggestion,
  type MemorizeChunk,
} from "../domain/memorizeChunks";
import { clearResumePoint } from "../domain/resumePoint";
import { loadHifzTasmiText } from "../domain/tasmiText";
import type { MemorizeFlowError, MemorizeStep } from "./HifzMemorizePanel";

interface RateBatchResponse {
  error?: string;
  ok?: boolean;
  results?: Array<{ ok: boolean; progressId: number }>;
}

interface MarkMemorizedResponse {
  error?: string;
  ok?: boolean;
}

interface SubmissionOptions {
  buildAlreadyRatedState: (
    queuePageIndex: number,
    activePageNumber: number | undefined,
  ) => MemorizeFlowError;
  currentChunk: MemorizeChunk | null;
  currentChunkIndex: number;
  goToStep: (step: MemorizeStep) => void;
  onChunkAyahKeysChange: (ayahKeys: string[] | null) => void;
  onChunkPause: () => void;
  onMushafHide: (hidden: boolean) => void;
  onPageComplete?: () => void;
  onSessionComplete?: () => void;
  pageChunks: MemorizeChunk[];
  setChunkSuggestion: (suggestion: ChunkSizeSuggestion) => void;
  setCurrentChunkIndex: (index: number) => void;
}

async function submitChunk(
  chunk: MemorizeChunk,
  rating: 1 | 3,
  validatePayload: boolean,
): Promise<MemorizeFlowError | null> {
  const ratings = chunk.items.map((item) => ({
    progressId: item.progressId,
    rating,
    block: item.block,
  }));
  const rateResponse = await fetch("/api/hifz/rate-batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ratings }),
  });
  const ratePayload = validatePayload
    ? (await rateResponse.json().catch(() => null)) as RateBatchResponse | null
    : null;
  if (
    !rateResponse.ok ||
    (validatePayload &&
      (ratePayload?.ok !== true ||
        ratePayload.results?.some((entry) => entry.ok !== true)))
  ) {
    return validatePayload && rateResponse.status === 401
      ? {
          message: "Sesi hafalan perlukan akaun aktif. Log masuk dahulu kemudian buka semula dari Hafal.",
          requiresSignIn: true,
        }
      : {
          message:
            ratePayload?.error ??
            "Markah hafalan tak dapat disimpan sekarang. Cuba lagi sekali.",
        };
  }

  const markResponse = await fetch("/api/hifz/mark-memorized", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ayahIds: chunk.items.map((item) => item.ayahId) }),
  });
  const markPayload = validatePayload
    ? (await markResponse.json().catch(() => null)) as MarkMemorizedResponse | null
    : null;
  if (!markResponse.ok || (validatePayload && markPayload?.ok !== true)) {
    return validatePayload && markResponse.status === 401
      ? {
          message: "Sesi hafalan perlukan akaun aktif. Log masuk dahulu kemudian buka semula dari Hafal.",
          requiresSignIn: true,
        }
      : {
          message:
            markPayload?.error ??
            "Status hafalan tak dapat disimpan sekarang. Cuba lagi sekali.",
        };
  }
  return null;
}

export function useMemorizeSubmission(options: SubmissionOptions) {
  const router = useRouter();
  const [complete, setComplete] = useState(false);
  const [errorState, setErrorState] = useState<MemorizeFlowError | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [tasmiActive, setTasmiActive] = useState(false);
  const [tasmiExpectedText, setTasmiExpectedText] = useState<string | null>(null);
  const [tasmiSurahNumber, setTasmiSurahNumber] = useState(0);
  const [tasmiStartAyah, setTasmiStartAyah] = useState(0);
  const [tasmiEndAyah, setTasmiEndAyah] = useState(0);
  const [tasmiAyahRanges, setTasmiAyahRanges] = useState<AyahRange[]>([]);
  const [tasmiLoading, setTasmiLoading] = useState(false);

  const finishChunk = useCallback(
    (recordConfidence: boolean | null) => {
      const chunk = options.currentChunk;
      if (!chunk) return;
      markRated("memorize", chunk.items.map((item) => item.progressId));
      if (recordConfidence !== null) {
        recordChunkRating(recordConfidence);
        options.setChunkSuggestion(getChunkSizeSuggestion());
      }

      const nextChunkIndex = options.currentChunkIndex + 1;
      if (nextChunkIndex < options.pageChunks.length) {
        options.setCurrentChunkIndex(nextChunkIndex);
        options.goToStep(1);
        setSubmitting(false);
        return;
      }

      const updated = advanceQueue("memorize");
      if (!updated) {
        setErrorState({
          message: "Sesi hafalan tak dapat disambung. Kembali ke Hafal dan buka semula sesi ini.",
        });
        setSubmitting(false);
        return;
      }
      if (isQueueComplete(updated)) {
        clearQueue("memorize");
        clearResumePoint();
        options.onPageComplete?.();
        options.onSessionComplete?.();
        setComplete(true);
        setSubmitting(false);
        options.onChunkAyahKeysChange(null);
        options.onMushafHide(false);
        return;
      }
      options.onPageComplete?.();
      const nextPage = updated.pageOrder[updated.currentPageIndex];
      if (recordConfidence === null) setSubmitting(false);
      router.push(buildQueuePageHref("memorize", nextPage, updated.currentPageIndex));
    },
    [options, router],
  );

  const startTasmi = useCallback(async () => {
    const chunk = options.currentChunk;
    if (!chunk || chunk.items.length === 0) return;
    setTasmiLoading(true);
    try {
      const tasmiText = await loadHifzTasmiText(
        chunk.items.map((item) => item.ayahId),
      );
      if (!tasmiText) return;
      setTasmiExpectedText(tasmiText.expectedText);
      setTasmiAyahRanges(tasmiText.ayahRanges);
      setTasmiSurahNumber(tasmiText.surahNumber);
      setTasmiStartAyah(tasmiText.startAyah);
      setTasmiEndAyah(tasmiText.endAyah);
      setTasmiActive(true);
      options.onChunkPause();
    } catch {
      // Failed to fetch ayah text — stay on manual mode.
    } finally {
      setTasmiLoading(false);
    }
  }, [options]);

  const handleTasmiEnd = useCallback(
    async (_result: TasmiSessionResult, label: TasmiRatingLabel) => {
      setTasmiActive(false);
      setTasmiExpectedText(null);
      const chunk = options.currentChunk;
      if (!chunk || chunk.items.length === 0) return;
      setSubmitting(true);
      try {
        const error = await submitChunk(chunk, label === "ulang" ? 1 : 3, false);
        if (error) {
          setErrorState(error);
          setSubmitting(false);
          return;
        }
        finishChunk(null);
      } catch {
        setErrorState({ message: "Simpanan hafalan gagal sekarang. Cuba lagi sekali." });
        setSubmitting(false);
      }
    },
    [finishChunk, options.currentChunk],
  );

  const handleRate = useCallback(
    async (confident: boolean) => {
      setSubmitting(true);
      setErrorState(null);
      try {
        const queue = loadQueue("memorize");
        if (!queue) {
          setErrorState({ message: "Sesi hafalan ini sudah tamat atau hilang. Buka semula dari Hafal." });
          setSubmitting(false);
          return;
        }
        if (!confident) {
          recordChunkRating(false);
          options.setChunkSuggestion(getChunkSizeSuggestion());
          options.goToStep(1);
          setSubmitting(false);
          return;
        }
        const chunk = options.currentChunk;
        if (!chunk || chunk.items.length === 0) {
          setErrorState({ message: "Chunk hafalan ini sudah hilang daripada sesi semasa. Kembali ke Hafal dan buka semula." });
          setSubmitting(false);
          return;
        }
        const progressIds = chunk.items.map((item) => item.progressId);
        if (areAllProgressIdsRated(queue, progressIds)) {
          const nextIncomplete = options.pageChunks.findIndex(
            (candidate) => !areAllProgressIdsRated(
              queue,
              candidate.items.map((item) => item.progressId),
            ),
          );
          if (nextIncomplete !== -1 && nextIncomplete !== options.currentChunkIndex) {
            options.setCurrentChunkIndex(nextIncomplete);
            options.goToStep(1);
            setSubmitting(false);
            return;
          }
          setErrorState(options.buildAlreadyRatedState(
            queue.currentPageIndex,
            queue.pageOrder[queue.currentPageIndex],
          ));
          setSubmitting(false);
          return;
        }
        const error = await submitChunk(chunk, 3, true);
        if (error) {
          setErrorState(error);
          setSubmitting(false);
          return;
        }
        finishChunk(true);
      } catch {
        setErrorState({ message: "Simpanan hafalan gagal sekarang. Cuba lagi sekali." });
        setSubmitting(false);
      }
    },
    [finishChunk, options],
  );

  const handleTasmiCancel = useCallback(() => {
    setTasmiActive(false);
    setTasmiExpectedText(null);
  }, []);

  return {
    complete,
    errorState,
    handleRate,
    handleTasmiCancel,
    handleTasmiEnd,
    startTasmi,
    submitting,
    tasmiActive,
    tasmiAyahRanges,
    tasmiEndAyah,
    tasmiExpectedText,
    tasmiLoading,
    tasmiStartAyah,
    tasmiSurahNumber,
  };
}
