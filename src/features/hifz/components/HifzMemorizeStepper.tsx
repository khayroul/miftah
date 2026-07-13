"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  areAllProgressIdsRated,
  buildQueuePageHref,
  loadQueue,
  getItemsForPage,
} from "../domain/sessionQueue";
import {
  buildMemorizeChunks,
  resolveMemorizeChunkLength,
  getChunkSizeSuggestion,
  type MemorizeChunkSizeOption,
  type ChunkSizeSuggestion,
} from "../domain/memorizeChunks";
import { saveResumePoint } from "../domain/resumePoint";
import {
  HifzMemorizePanel,
  type MemorizeFlowError,
  type MemorizeStep,
} from "./HifzMemorizePanel";
import { useMemorizeSubmission } from "./useMemorizeSubmission";

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
  const [currentStep, setCurrentStep] = useState<MemorizeStep>(1);
  const [chunkSize, setChunkSize] = useState<MemorizeChunkSizeOption>("auto");
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0);
  const [panelElement, setPanelElement] = useState<HTMLDivElement | null>(null);
  const [chunkSuggestion, setChunkSuggestion] = useState<ChunkSizeSuggestion>(null);
  const [suggestionDismissed, setSuggestionDismissed] = useState(false);
  const [showChunkSize, setShowChunkSize] = useState(false);

  useEffect(() => {
    setTimeout(() => setChunkSuggestion(getChunkSizeSuggestion()), 0);
  }, []);

  const buildAlreadyRatedState = useCallback(
    (queuePageIndex: number, activePageNumber: number | undefined): MemorizeFlowError => ({
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
  const effectiveChunkLength = useMemo(
    () => resolveMemorizeChunkLength(pageItems.length, chunkSize),
    [chunkSize, pageItems.length],
  );
  const initialFlowError = useMemo<MemorizeFlowError | null>(() => {
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
  const goToStep = useCallback(
    (step: MemorizeStep) => {
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

  const submission = useMemorizeSubmission({
    buildAlreadyRatedState,
    currentChunk,
    currentChunkIndex,
    goToStep,
    onChunkAyahKeysChange,
    onChunkPause,
    onMushafHide,
    onPageComplete,
    onSessionComplete,
    pageChunks,
    setChunkSuggestion,
    setCurrentChunkIndex,
  });
  const displayedError = submission.errorState ?? initialFlowError;

  useEffect(() => {
    onChunkAyahKeysChange(currentChunk?.ayahKeys ?? null);

    return () => {
      onChunkAyahKeysChange(null);
    };
  }, [currentChunk?.ayahKeys, onChunkAyahKeysChange]);

  useEffect(() => {
    setTimeout(() => {
      setCurrentChunkIndex((current) =>
        current === recoveredChunkIndex ? current : recoveredChunkIndex,
      );
      setCurrentStep(1);
    }, 0);
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
        const timer = setTimeout(() => {
          setAutoAdvancing(true);
          setTimeout(() => {
            setAutoAdvancing(false);
            goToStep(2);
          }, 1500);
        }, 0);
        return () => clearTimeout(timer);
      }
    } else if (currentStep === 2) {
      listenCountRef.current += 1;
      if (listenCountRef.current >= 2) {
        const timer = setTimeout(() => {
          setAutoAdvancing(true);
          setTimeout(() => {
            setAutoAdvancing(false);
            goToStep(3);
          }, 1500);
        }, 0);
        return () => clearTimeout(timer);
      }
    }
  }, [audioFinishedSignal, currentStep, goToStep]);

  useEffect(() => {
    if (!submission.complete && !displayedError) {
      saveResumePoint({
        flow: "memorize",
        pageNumber,
        queueIndex,
        chunkIndex: currentChunkIndex,
        step: currentStep,
      });
    }
  }, [
    currentChunkIndex,
    currentStep,
    displayedError,
    pageNumber,
    queueIndex,
    submission.complete,
  ]);

  const handleNext = useCallback(() => {
    if (currentStep < 4) {
      goToStep((currentStep + 1) as MemorizeStep);
    }
  }, [currentStep, goToStep]);

  const handleBack = useCallback(() => {
    if (currentStep > 1) {
      goToStep((currentStep - 1) as MemorizeStep);
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


  return (
    <HifzMemorizePanel
      autoAdvancing={autoAdvancing}
      bottomOffsetPx={bottomOffsetPx}
      chunkCount={chunkCount}
      chunkSize={chunkSize}
      chunkSuggestion={chunkSuggestion}
      complete={submission.complete}
      currentChunk={currentChunk}
      currentChunkIndex={currentChunkIndex}
      currentStep={currentStep}
      error={displayedError}
      onApplySuggestion={() => {
        const current = resolveMemorizeChunkLength(pageItems.length, chunkSize);
        const next = chunkSuggestion === "smaller"
          ? Math.max(1, current - 1) as MemorizeChunkSizeOption
          : Math.min(3, current + 1) as MemorizeChunkSizeOption;
        handleChunkSizeChange(next);
        setSuggestionDismissed(true);
      }}
      onBack={handleBack}
      onChunkListen={onChunkListen}
      onChunkPause={onChunkPause}
      onChunkSizeChange={handleChunkSizeChange}
      onDismissSuggestion={() => setSuggestionDismissed(true)}
      onJumpToChunk={jumpToChunk}
      onNext={handleNext}
      onRate={submission.handleRate}
      onTasmiCancel={submission.handleTasmiCancel}
      onTasmiEnd={submission.handleTasmiEnd}
      onTasmiStart={submission.startTasmi}
      onToggleChunkSize={() => setShowChunkSize((visible) => !visible)}
      setPanelElement={setPanelElement}
      showChunkSize={showChunkSize}
      submitting={submission.submitting}
      suggestionDismissed={suggestionDismissed}
      tasmiActive={submission.tasmiActive}
      tasmiAyahRanges={submission.tasmiAyahRanges}
      tasmiEndAyah={submission.tasmiEndAyah}
      tasmiExpectedText={submission.tasmiExpectedText}
      tasmiLoading={submission.tasmiLoading}
      tasmiStartAyah={submission.tasmiStartAyah}
      tasmiSurahNumber={submission.tasmiSurahNumber}
    />
  );
}
