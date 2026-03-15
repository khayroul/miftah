"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import {
  buildMemorizeChunks,
  resolveMemorizeChunkLength,
  recordChunkRating,
  getChunkSizeSuggestion,
  type MemorizeChunk,
  type MemorizeChunkSizeOption,
  type ChunkSizeSuggestion,
} from "@/lib/hifz/memorizeChunks";
import { TasmiSessionUI, type AyahRange } from "@/components/TasmiSessionUI";
import { createSupabaseBrowserClient } from "@/lib/supabase-auth";
import type { TasmiSessionResult } from "@/lib/tasmi/tasmi-session";
import type { TasmiRatingLabel } from "@/lib/tasmi/fsrs-bridge";
import { saveResumePoint, clearResumePoint } from "@/lib/hifz/resumePoint";

interface HifzMemorizeStepperProps {
  bottomOffsetPx?: number;
  pageNumber: number;
  queueIndex?: number;
  audioFinishedSignal?: number;
  onChunkAyahKeysChange: (ayahKeys: string[] | null) => void;
  onChunkListen: () => void;
  onChunkPause: () => void;
  onMushafHide: (hidden: boolean) => void;
  onViewportInsetChange?: (insetPx: number) => void;
  onSessionComplete?: () => void;
  onPageComplete?: () => void;
}

type Step = 1 | 2 | 3 | 4;

const STEPS: Array<{ step: Step; label: string; description: string }> = [
  { step: 1, label: "Dengar & Baca", description: "Dengar chunk ini sambil ikut mushaf." },
  { step: 2, label: "Cuba Sendiri", description: "Baca kuat bersama audio. Ulang chunk jika perlu." },
  { step: 3, label: "Tutup & Uji", description: "Jeda audio dan cuba baca tanpa melihat." },
  { step: 4, label: "Tandakan", description: "Nilai chunk ini sebelum bergerak ke chunk seterusnya." },
];

const CHUNK_SIZE_OPTIONS: Array<{
  label: string;
  value: MemorizeChunkSizeOption;
}> = [
  { label: "Auto", value: "auto" },
  { label: "1", value: 1 },
  { label: "2", value: 2 },
  { label: "3", value: 3 },
];

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

interface MarkMemorizedResponse {
  count?: number;
  error?: string;
  ok?: boolean;
}

function describeChunk(chunk: MemorizeChunk | null): string {
  if (!chunk || chunk.items.length === 0) {
    return "Tiada ayat dalam chunk ini";
  }

  const first = chunk.items[0];
  const last = chunk.items[chunk.items.length - 1] ?? first;
  if (!first || !last) {
    return "Tiada ayat dalam chunk ini";
  }

  if (first.ayahKey === last.ayahKey) {
    return `Ayat ${first.ayahKey}`;
  }

  return `Ayat ${first.ayahKey} - ${last.ayahKey}`;
}

export function HifzMemorizeStepper({
  bottomOffsetPx = 0,
  pageNumber,
  queueIndex = 0,
  audioFinishedSignal = 0,
  onChunkAyahKeysChange,
  onChunkListen,
  onChunkPause,
  onMushafHide,
  onViewportInsetChange,
  onSessionComplete,
  onPageComplete,
}: HifzMemorizeStepperProps) {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<Step>(1);
  const [chunkSize, setChunkSize] = useState<MemorizeChunkSizeOption>("auto");
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [complete, setComplete] = useState(false);
  const [errorState, setErrorState] = useState<FlowErrorState | null>(null);
  const [panelElement, setPanelElement] = useState<HTMLDivElement | null>(null);
  const [tasmiActive, setTasmiActive] = useState(false);
  const [tasmiExpectedText, setTasmiExpectedText] = useState<string | null>(null);
  const [tasmiSurahNumber, setTasmiSurahNumber] = useState(0);
  const [tasmiStartAyah, setTasmiStartAyah] = useState(0);
  const [tasmiEndAyah, setTasmiEndAyah] = useState(0);
  const [tasmiAyahRanges, setTasmiAyahRanges] = useState<AyahRange[]>([]);
  const [tasmiLoading, setTasmiLoading] = useState(false);
  const [chunkSuggestion, setChunkSuggestion] = useState<ChunkSizeSuggestion>(null);
  const [suggestionDismissed, setSuggestionDismissed] = useState(false);

  useEffect(() => {
    setChunkSuggestion(getChunkSizeSuggestion());
  }, []);

  const buildAlreadyRatedState = useCallback(
    (queuePageIndex: number, activePageNumber: number | undefined): FlowErrorState => ({
      message:
        activePageNumber && activePageNumber !== pageNumber
          ? "Halaman ini sudah ditandakan dalam sesi hafalan semasa. Sambung pada halaman aktif untuk elak rekod berganda."
          : "Chunk ini sudah ditandakan dalam sesi hafalan semasa.",
      continueHref:
        activePageNumber && activePageNumber !== pageNumber
          ? buildQueuePageHref("memorize", activePageNumber, queuePageIndex)
          : undefined,
      continueLabel: "Teruskan Sesi",
    }),
    [pageNumber],
  );

  const pageItems = useMemo(() => {
    const queue = loadQueue("memorize");
    if (!queue) {
      return [];
    }
    return getItemsForPage(queue, pageNumber);
  }, [pageNumber]);

  const pageChunks = useMemo(
    () => buildMemorizeChunks(pageItems, chunkSize),
    [chunkSize, pageItems],
  );
  const recoveredChunkIndex = useMemo(() => {
    const queue = loadQueue("memorize");
    if (!queue || pageChunks.length === 0) {
      return 0;
    }

    const nextIncompleteChunkIndex = pageChunks.findIndex(
      (chunk) =>
        !areAllProgressIdsRated(
          queue,
          chunk.items.map((item) => item.progressId),
        ),
    );

    if (nextIncompleteChunkIndex === -1) {
      return 0;
    }

    return nextIncompleteChunkIndex;
  }, [pageChunks]);
  const currentChunk = pageChunks[currentChunkIndex] ?? null;
  const chunkCount = pageChunks.length;
  const chunkAyahCount = currentChunk?.items.length ?? 0;
  const effectiveChunkLength = useMemo(
    () => resolveMemorizeChunkLength(pageItems.length, chunkSize),
    [chunkSize, pageItems.length],
  );
  const initialFlowError = useMemo<FlowErrorState | null>(() => {
    const queue = loadQueue("memorize");
    if (!queue) {
      return {
        message: "Sesi hafalan ini sudah tamat atau hilang. Buka semula dari Hafal.",
      };
    }

    if (getItemsForPage(queue, pageNumber).length === 0) {
      return {
        message: "Halaman ini tiada dalam sesi hafalan semasa. Kembali ke Hafal untuk sambung semula.",
      };
    }

    if (areAllProgressIdsRated(queue, getItemsForPage(queue, pageNumber).map((item) => item.progressId))) {
      return buildAlreadyRatedState(
        queue.currentPageIndex,
        queue.pageOrder[queue.currentPageIndex],
      );
    }

    return null;
  }, [buildAlreadyRatedState, pageNumber]);
  const displayedError: FlowErrorState | null = errorState ?? initialFlowError;

  const goToStep = useCallback(
    (step: Step) => {
      setCurrentStep(step);
      onMushafHide(step === 3);
    },
    [onMushafHide],
  );

  const jumpToChunk = useCallback(
    (nextChunkIndex: number) => {
      if (nextChunkIndex < 0 || nextChunkIndex >= pageChunks.length) {
        return;
      }
      setCurrentChunkIndex(nextChunkIndex);
      goToStep(1);
    },
    [goToStep, pageChunks.length],
  );

  useEffect(() => {
    onChunkAyahKeysChange(currentChunk?.ayahKeys ?? null);

    return () => {
      onChunkAyahKeysChange(null);
    };
  }, [currentChunk?.ayahKeys, onChunkAyahKeysChange]);

  useEffect(() => {
    setCurrentChunkIndex((current) =>
      current === recoveredChunkIndex ? current : recoveredChunkIndex,
    );
    setCurrentStep(1);
  }, [recoveredChunkIndex]);

  useEffect(() => {
    if (currentStep === 1 && currentChunk && currentChunk.items.length > 0) {
      onChunkListen();
      return;
    }

    if (currentStep === 3) {
      onChunkPause();
    }
  }, [currentChunk, currentStep, onChunkListen, onChunkPause]);

  useEffect(() => {
    onMushafHide(false);
    return () => {
      onMushafHide(false);
      onChunkPause();
      onChunkAyahKeysChange(null);
    };
  }, [onChunkAyahKeysChange, onChunkPause, onMushafHide]);

  useEffect(() => {
    if (!onViewportInsetChange) {
      return;
    }
    if (!panelElement) {
      onViewportInsetChange(0);
      return;
    }

    const reportInset = () => {
      const nextInset = Math.ceil(
        panelElement.getBoundingClientRect().height + bottomOffsetPx,
      );
      onViewportInsetChange(nextInset);
    };

    reportInset();

    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            reportInset();
          });
    observer?.observe(panelElement);
    window.addEventListener("resize", reportInset);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", reportInset);
      onViewportInsetChange(0);
    };
  }, [bottomOffsetPx, onViewportInsetChange, panelElement]);

  const listenCountRef = useRef(0);
  const prevAudioSignalRef = useRef(audioFinishedSignal);
  const [autoAdvancing, setAutoAdvancing] = useState(false);

  useEffect(() => {
    listenCountRef.current = 0;
  }, [currentChunkIndex]);

  useEffect(() => {
    if (audioFinishedSignal === prevAudioSignalRef.current) return;
    prevAudioSignalRef.current = audioFinishedSignal;

    if (currentStep === 1) {
      listenCountRef.current += 1;
      if (listenCountRef.current >= 1) {
        setAutoAdvancing(true);
        const timer = setTimeout(() => {
          setAutoAdvancing(false);
          goToStep(2);
        }, 1500);
        return () => clearTimeout(timer);
      }
    } else if (currentStep === 2) {
      listenCountRef.current += 1;
      if (listenCountRef.current >= 2) {
        setAutoAdvancing(true);
        const timer = setTimeout(() => {
          setAutoAdvancing(false);
          goToStep(3);
        }, 1500);
        return () => clearTimeout(timer);
      }
    }
  }, [audioFinishedSignal, currentStep, goToStep]);

  useEffect(() => {
    if (!complete && !displayedError) {
      saveResumePoint({
        flow: "memorize",
        pageNumber,
        queueIndex,
        chunkIndex: currentChunkIndex,
        step: currentStep,
      });
    }
  }, [complete, currentChunkIndex, currentStep, displayedError, pageNumber, queueIndex]);

  const startTasmi = useCallback(async () => {
    const chunkItems = currentChunk?.items ?? [];
    if (chunkItems.length === 0) return;

    setTasmiLoading(true);
    try {
      // Parse ayahKeys to get surah/ayah numbers
      const ayahKeys = chunkItems.map((item) => item.ayahKey);
      const parsed = ayahKeys.map((key) => {
        const [surah, ayah] = key.split(":").map(Number);
        return { surah: surah ?? 0, ayah: ayah ?? 0 };
      });

      const surahNumber = parsed[0]?.surah ?? 0;
      const startAyah = parsed[0]?.ayah ?? 0;
      const endAyah = parsed[parsed.length - 1]?.ayah ?? startAyah;

      // Fetch text_simple (Imla'i spelling) for matching — Whisper outputs modern Arabic,
      // not Uthmani script, so we must compare against modern spelling.
      const supabase = createSupabaseBrowserClient();
      const ayahIds = chunkItems.map((item) => item.ayahId);
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
      onChunkPause();
    } catch {
      // Failed to fetch ayah text — stay on manual mode
    }
    setTasmiLoading(false);
  }, [currentChunk, onChunkPause]);

  const handleTasmiEnd = useCallback(
    async (result: TasmiSessionResult, label: TasmiRatingLabel) => {
      setTasmiActive(false);
      setTasmiExpectedText(null);

      const chunkItems = currentChunk?.items ?? [];
      if (chunkItems.length === 0) return;

      // Map tasmi' result to binary rating (1=Again or 3=Good)
      // rate-batch only accepts 1 | 3; ulang→1 (re-memorize), anything better→3 (pass)
      const binaryRating = label === "ulang" ? (1 as const) : (3 as const);

      const ratings = chunkItems.map((item) => ({
        progressId: item.progressId,
        rating: binaryRating,
        block: item.block,
      }));

      setSubmitting(true);
      try {
        const rateResponse = await fetch("/api/hifz/rate-batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ratings }),
        });

        if (!rateResponse.ok) {
          setErrorState({
            message: "Markah hafalan tak dapat disimpan sekarang. Cuba lagi sekali.",
          });
          setSubmitting(false);
          return;
        }

        const markResponse = await fetch("/api/hifz/mark-memorized", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ayahIds: chunkItems.map((item) => item.ayahId),
          }),
        });

        if (!markResponse.ok) {
          setErrorState({
            message: "Status hafalan tak dapat disimpan sekarang. Cuba lagi sekali.",
          });
          setSubmitting(false);
          return;
        }

        markRated(
          "memorize",
          chunkItems.map((item) => item.progressId),
        );

        const nextChunkIndex = currentChunkIndex + 1;
        if (nextChunkIndex < pageChunks.length) {
          setCurrentChunkIndex(nextChunkIndex);
          goToStep(1);
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
          onPageComplete?.();
          onSessionComplete?.();
          setComplete(true);
          setSubmitting(false);
          onChunkAyahKeysChange(null);
          onMushafHide(false);
          return;
        }

        onPageComplete?.();
        const nextPage = updated.pageOrder[updated.currentPageIndex];
        router.push(
          buildQueuePageHref("memorize", nextPage, updated.currentPageIndex),
        );
      } catch {
        setErrorState({
          message: "Simpanan hafalan gagal sekarang. Cuba lagi sekali.",
        });
      }
      setSubmitting(false);
    },
    [
      currentChunk,
      currentChunkIndex,
      goToStep,
      onChunkAyahKeysChange,
      onMushafHide,
      pageChunks.length,
      router,
    ],
  );

  const handleTasmiCancel = useCallback(() => {
    setTasmiActive(false);
    setTasmiExpectedText(null);
  }, []);

  const handleNext = useCallback(() => {
    if (currentStep < 4) {
      goToStep((currentStep + 1) as Step);
    }
  }, [currentStep, goToStep]);

  const handleBack = useCallback(() => {
    if (currentStep > 1) {
      goToStep((currentStep - 1) as Step);
    }
  }, [currentStep, goToStep]);

  const handleChunkSizeChange = useCallback(
    (nextChunkSize: MemorizeChunkSizeOption) => {
      const currentItemOffset = currentChunkIndex * effectiveChunkLength;
      const nextChunkLength = resolveMemorizeChunkLength(
        pageItems.length,
        nextChunkSize,
      );
      const nextChunkIndex = Math.floor(currentItemOffset / nextChunkLength);
      setChunkSize(nextChunkSize);
      setCurrentChunkIndex(Math.max(0, nextChunkIndex));
      goToStep(1);
    },
    [currentChunkIndex, effectiveChunkLength, goToStep, pageItems.length],
  );

  const handleRate = useCallback(
    async (confident: boolean) => {
      const chunkItems = currentChunk?.items ?? [];

      setSubmitting(true);
      setErrorState(null);
      try {
        const queue = loadQueue("memorize");
        if (!queue) {
          setErrorState({
            message: "Sesi hafalan ini sudah tamat atau hilang. Buka semula dari Hafal.",
          });
          setSubmitting(false);
          return;
        }

        if (!confident) {
          recordChunkRating(false);
          setChunkSuggestion(getChunkSizeSuggestion());
          goToStep(1);
          setSubmitting(false);
          return;
        }

        if (chunkItems.length === 0) {
          setErrorState({
            message: "Chunk hafalan ini sudah hilang daripada sesi semasa. Kembali ke Hafal dan buka semula.",
          });
          setSubmitting(false);
          return;
        }

        const chunkProgressIds = chunkItems.map((item) => item.progressId);
        if (areAllProgressIdsRated(queue, chunkProgressIds)) {
          const nextIncompleteChunkIndex = pageChunks.findIndex(
            (chunk) =>
              !areAllProgressIdsRated(
                queue,
                chunk.items.map((item) => item.progressId),
              ),
          );

          if (
            nextIncompleteChunkIndex !== -1 &&
            nextIncompleteChunkIndex !== currentChunkIndex
          ) {
            setCurrentChunkIndex(nextIncompleteChunkIndex);
            goToStep(1);
            setSubmitting(false);
            return;
          }

          setErrorState(
            buildAlreadyRatedState(
              queue.currentPageIndex,
              queue.pageOrder[queue.currentPageIndex],
            ),
          );
          setSubmitting(false);
          return;
        }

        const ratings = chunkItems.map((item) => ({
          progressId: item.progressId,
          rating: 3 as const,
          block: item.block,
        }));

        const rateResponse = await fetch("/api/hifz/rate-batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ratings }),
        });
        const ratePayload = (await rateResponse.json().catch(() => null)) as
          | RateBatchResponse
          | null;

        if (
          !rateResponse.ok ||
          ratePayload?.ok !== true ||
          ratePayload.results?.some((entry) => entry.ok !== true)
        ) {
          setErrorState(
            rateResponse.status === 401
              ? {
                  message: "Sesi hafalan perlukan akaun aktif. Log masuk dahulu kemudian buka semula dari Hafal.",
                  requiresSignIn: true,
                }
              : {
                  message:
                    ratePayload?.error ??
                    "Markah hafalan tak dapat disimpan sekarang. Cuba lagi sekali.",
                },
          );
          setSubmitting(false);
          return;
        }

        const markResponse = await fetch("/api/hifz/mark-memorized", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ayahIds: chunkItems.map((item) => item.ayahId),
          }),
        });
        const markPayload = (await markResponse.json().catch(() => null)) as
          | MarkMemorizedResponse
          | null;

        if (!markResponse.ok || markPayload?.ok !== true) {
          setErrorState(
            markResponse.status === 401
              ? {
                  message: "Sesi hafalan perlukan akaun aktif. Log masuk dahulu kemudian buka semula dari Hafal.",
                  requiresSignIn: true,
                }
              : {
                  message:
                    markPayload?.error ??
                    "Status hafalan tak dapat disimpan sekarang. Cuba lagi sekali.",
                },
          );
          setSubmitting(false);
          return;
        }

        markRated(
          "memorize",
          chunkItems.map((item) => item.progressId),
        );

        recordChunkRating(true);
        setChunkSuggestion(getChunkSizeSuggestion());

        const nextChunkIndex = currentChunkIndex + 1;
        if (nextChunkIndex < pageChunks.length) {
          setCurrentChunkIndex(nextChunkIndex);
          goToStep(1);
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
          onPageComplete?.();
          onSessionComplete?.();
          setComplete(true);
          setSubmitting(false);
          onChunkAyahKeysChange(null);
          onMushafHide(false);
          return;
        }

        onPageComplete?.();
        const nextPage = updated.pageOrder[updated.currentPageIndex];
        router.push(
          buildQueuePageHref("memorize", nextPage, updated.currentPageIndex),
        );
      } catch {
        setErrorState({
          message: "Simpanan hafalan gagal sekarang. Cuba lagi sekali.",
        });
        setSubmitting(false);
      }
    },
    [
      buildAlreadyRatedState,
      currentChunk,
      currentChunkIndex,
      goToStep,
      onChunkAyahKeysChange,
      onMushafHide,
      pageChunks,
      router,
    ],
  );

  if (complete) {
    return (
      <div
        ref={setPanelElement}
        className="fixed inset-x-0 bottom-0 z-50 border-t border-stone-200 bg-white/95 px-4 py-6 text-center shadow-lg backdrop-blur-md dark:border-stone-700 dark:bg-stone-900/95"
        style={{ bottom: bottomOffsetPx }}
      >
        <p className="mb-1 text-xl font-bold text-stone-900 dark:text-stone-100">
          Alhamdulillah
        </p>
        <p className="mb-4 text-sm text-stone-500 dark:text-stone-400">
          Sesi hafalan baru selesai!
        </p>
        <a
          href="/hifz"
          className="inline-flex items-center rounded-xl bg-amber-500 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-600"
        >
          Kembali ke Hafal
        </a>
      </div>
    );
  }

  if (displayedError) {
    return (
      <div
        ref={setPanelElement}
        className="fixed inset-x-0 bottom-0 z-50 border-t border-rose-200 bg-white/95 px-4 py-5 text-center shadow-lg backdrop-blur-md dark:border-rose-900/40 dark:bg-stone-900/95"
        style={{ bottom: bottomOffsetPx }}
      >
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

  const stepInfo = STEPS[currentStep - 1];
  const restartLabel = currentStep === 3 ? "Semak Audio" : "Main Semula";

  return (
    <div
      ref={setPanelElement}
      className="fixed inset-x-0 bottom-0 z-50 border-t border-stone-200 bg-white/95 px-4 py-4 shadow-lg backdrop-blur-md dark:border-stone-700 dark:bg-stone-900/95"
      style={{ bottom: bottomOffsetPx }}
    >
      {autoAdvancing ? (
        <div className="mb-3 flex items-center justify-center">
          <p className="animate-pulse text-sm font-medium text-amber-600 dark:text-amber-400">
            Seterusnya...
          </p>
        </div>
      ) : null}

      <div className="mb-3 flex items-center justify-center gap-2">
        {STEPS.map((step) => (
          <div
            key={step.step}
            className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors ${
              step.step < currentStep
                ? "bg-amber-500 text-white"
                : step.step === currentStep
                  ? "bg-amber-100 text-amber-800 ring-2 ring-amber-400 dark:bg-amber-900/50 dark:text-amber-200 dark:ring-amber-500"
                  : "bg-stone-100 text-stone-400 dark:bg-stone-800 dark:text-stone-500"
            }`}
          >
            {step.step < currentStep ? (
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              step.step
            )}
          </div>
        ))}
      </div>

      <div className="mb-3 rounded-2xl border border-amber-200/80 bg-amber-50/75 px-4 py-3 text-center dark:border-amber-700/45 dark:bg-amber-900/20">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-900/80 dark:text-amber-100/80">
          Chunk {chunkCount > 0 ? currentChunkIndex + 1 : 0} / {chunkCount}
        </p>
        <p className="mt-1 text-sm font-semibold text-stone-800 dark:text-stone-100">
          {describeChunk(currentChunk)}
        </p>
        <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
          {chunkAyahCount} ayat dalam chunk ini
        </p>
      </div>

      {chunkSuggestion && !suggestionDismissed ? (
        <div className="mb-3 flex items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2 dark:border-amber-700/50 dark:bg-amber-900/20">
          <p className="text-xs text-amber-800 dark:text-amber-200">
            {chunkSuggestion === "smaller"
              ? "Nampak susah — cuba chunk lebih kecil?"
              : "Bagus! Cuba chunk lebih besar?"}
          </p>
          <button
            type="button"
            onClick={() => {
              const current = resolveMemorizeChunkLength(pageItems.length, chunkSize);
              const next = chunkSuggestion === "smaller"
                ? Math.max(1, current - 1) as MemorizeChunkSizeOption
                : Math.min(3, current + 1) as MemorizeChunkSizeOption;
              handleChunkSizeChange(next);
              setSuggestionDismissed(true);
            }}
            className="rounded-lg bg-amber-500 px-3 py-1 text-xs font-semibold text-white transition hover:bg-amber-600"
          >
            {chunkSuggestion === "smaller" ? "Kecilkan" : "Besarkan"}
          </button>
          <button
            type="button"
            onClick={() => setSuggestionDismissed(true)}
            className="text-xs text-amber-600 hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-200"
          >
            Abaikan
          </button>
        </div>
      ) : null}

      <div className="mb-3">
        <p className="mb-2 text-center text-xs font-semibold uppercase tracking-[0.18em] text-stone-500 dark:text-stone-400">
          Saiz Chunk
        </p>
        <div className="mx-auto grid max-w-md grid-cols-4 gap-2">
          {CHUNK_SIZE_OPTIONS.map((option) => {
            const selected = chunkSize === option.value;
            return (
              <button
                key={String(option.value)}
                type="button"
                onClick={() => handleChunkSizeChange(option.value)}
                className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
                  selected
                    ? "bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900"
                    : "border border-stone-300 bg-white text-stone-700 hover:bg-stone-50 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mb-3 text-center">
        <p className="text-sm font-semibold text-stone-800 dark:text-stone-200">
          {stepInfo.label}
        </p>
        <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">
          {stepInfo.description}
        </p>
      </div>

      {/* Tasmi' engine UI — shown when active on step 3 */}
      {tasmiActive && tasmiExpectedText ? (
        <div className="mb-3">
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
      ) : currentStep === 3 ? (
        <div className="mb-3 flex justify-center">
          <button
            type="button"
            disabled={tasmiLoading}
            onClick={startTasmi}
            className="rounded-xl bg-rose-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-700 disabled:opacity-50"
          >
            {tasmiLoading ? "Menyediakan..." : "Mula Tasmi\u2019"}
          </button>
        </div>
      ) : null}

      <div className="mb-3 flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          disabled={currentChunkIndex === 0}
          onClick={() => jumpToChunk(currentChunkIndex - 1)}
          className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700"
        >
          Chunk Sebelum
        </button>
        <button
          type="button"
          onClick={onChunkListen}
          className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700"
        >
          {restartLabel}
        </button>
        <button
          type="button"
          onClick={onChunkPause}
          className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-50 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700"
        >
          Jeda
        </button>
        <button
          type="button"
          disabled={currentChunkIndex >= chunkCount - 1}
          onClick={() => jumpToChunk(currentChunkIndex + 1)}
          className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700"
        >
          Chunk Seterusnya
        </button>
      </div>

      {currentStep < 4 ? (
        <div className="flex justify-center gap-3">
          {currentStep > 1 && (
            <button
              type="button"
              onClick={handleBack}
              className="rounded-xl border border-stone-300 bg-white px-5 py-2.5 text-sm font-medium text-stone-700 transition hover:bg-stone-50 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700"
            >
              Kembali
            </button>
          )}
          <button
            type="button"
            onClick={handleNext}
            className="rounded-xl bg-amber-500 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-600"
          >
            Seterusnya
          </button>
          <a
            href="/hifz"
            className="rounded-xl border border-stone-300 bg-white px-5 py-2.5 text-sm font-medium text-stone-500 transition hover:bg-stone-50 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-400 dark:hover:bg-stone-700"
          >
            Keluar
          </a>
        </div>
      ) : (
        <div className="flex justify-center gap-3">
          <button
            type="button"
            disabled={submitting}
            onClick={() => handleRate(true)}
            className="flex-1 max-w-[200px] rounded-xl bg-teal-600 px-6 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-teal-700 disabled:opacity-50"
          >
            Yakin
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => handleRate(false)}
            className="flex-1 max-w-[200px] rounded-xl border border-stone-300 bg-white px-6 py-3 text-base font-semibold text-stone-700 shadow-sm transition hover:bg-stone-50 disabled:opacity-50 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200"
          >
            Belum Yakin
          </button>
        </div>
      )}
    </div>
  );
}
