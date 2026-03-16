"use client";

import dynamic from "next/dynamic";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  MushafPageView,
  type MushafAyahDetail,
} from "@/components/MushafPageView";
import { ReadOnlyMushafPageView } from "@/components/ReadOnlyMushafPageView";
import { ReadModeTools } from "@/components/ReadModeTools";
import { useReadAudio } from "@/components/ReadAudioProvider";
import type { ReadAudioTrack } from "@/lib/pageAudioTracks";
import type { HifzQueueResponse } from "@/lib/hifz/queue";
import {
  buildQueuePageHref,
  buildRecoveredRatedProgressIds,
  findQueuePageIndex,
  getAdjacentQueuePageFromQueue,
  loadQueue,
  recoverQueueState,
  saveQueueState,
  type HifzFlowType,
  type HifzQueuePagePointer,
  type HifzSessionQueue,
} from "@/lib/hifz/sessionQueue";
import { buildSignInPath } from "@/lib/auth";
import { rememberLastReadPage } from "@/lib/readingProgressStorage";
import { useReadMode } from "@/lib/useReadMode";
import { useRouter, useSearchParams } from "next/navigation";
import type { ReadMode } from "@/lib/readMode";
import type { MushafWordTranslationMap } from "@/types/mushaf";
import type { MushafLayoutPage } from "@/types/mushafLayout";
import type { ReactNode } from "react";
import Link from "next/link";
import { preCacheAudioUrls } from "@/lib/hifz/audioPreCache";

const FahamExposureTracker = dynamic(
  () =>
    import("@/components/FahamExposureTracker").then(
      (module) => module.FahamExposureTracker,
    ),
  {
    ssr: false,
    loading: () => null,
  },
);

const ReadJumpControls = dynamic(
  () =>
    import("@/components/ReadJumpControls").then(
      (module) => module.ReadJumpControls,
    ),
  {
    ssr: false,
    loading: () => null,
  },
);

const HifzTasmiOverlay = dynamic(
  () =>
    import("@/components/HifzTasmiOverlay").then(
      (module) => module.HifzTasmiOverlay,
    ),
  {
    ssr: false,
    loading: () => null,
  },
);

const HifzInlineRating = dynamic(
  () =>
    import("@/components/HifzInlineRating").then(
      (module) => module.HifzInlineRating,
    ),
  {
    ssr: false,
    loading: () => null,
  },
);

const HifzMemorizeStepper = dynamic(
  () =>
    import("@/components/HifzMemorizeStepper").then(
      (module) => module.HifzMemorizeStepper,
    ),
  {
    ssr: false,
    loading: () => null,
  },
);

const HifzSessionBar = dynamic(
  () =>
    import("@/components/HifzSessionBar").then(
      (module) => module.HifzSessionBar,
    ),
  {
    ssr: false,
    loading: () => null,
  },
);

const HifzSessionComplete = dynamic(
  () =>
    import("@/components/HifzSessionComplete").then(
      (module) => module.HifzSessionComplete,
    ),
  {
    ssr: false,
    loading: () => null,
  },
);

interface ReadPageWorkspaceProps {
  pageNumber: number;
  layout: MushafLayoutPage;
  wordTranslations: MushafWordTranslationMap;
  currentSurahId: number;
  currentJuzNumber: number;
  themeSurahId: number;
  audioTracks: ReadAudioTrack[];
  ayahDetails: MushafAyahDetail[];
  memorizedAyahKeys: string[];
  readingAyahIds: number[];
  mushafHeader?: ReactNode;
  initialReadMode?: ReadMode | null;
  forceHifzRevealByThirds?: boolean;
  hifzFlow?: HifzFlowType | null;
  hifzNavigationSearch?: string | null;
  personalizationPageNumber?: number | null;
}

const HIFZ_REVEAL_BY_THIRDS_STORAGE_KEY = "miftah:read:hifz-reveal-by-thirds";
const AUDIO_DISCOVERY_STORAGE_KEY = "miftah:audio:discovered";

function subscribeAudioDiscovery(callback: () => void): () => void {
  window.addEventListener("miftah:audio-discovery", callback);
  window.addEventListener("storage", callback);

  return () => {
    window.removeEventListener("miftah:audio-discovery", callback);
    window.removeEventListener("storage", callback);
  };
}

function getAudioDiscoverySnapshot(): boolean {
  return window.localStorage.getItem(AUDIO_DISCOVERY_STORAGE_KEY) === "1";
}

function scheduleIdleTask(callback: () => void, timeoutMs = 1200): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  if ("requestIdleCallback" in window) {
    const idleId = window.requestIdleCallback(callback, {
      timeout: timeoutMs,
    });
    return () => {
      window.cancelIdleCallback(idleId);
    };
  }

  const timerId = globalThis.setTimeout(callback, timeoutMs);
  return () => {
    globalThis.clearTimeout(timerId);
  };
}

function resolveQueueIndex(
  queue: Pick<HifzSessionQueue, "pageOrder">,
  pageNumber: number,
  queueIndexFromUrl: number | null,
): number | null {
  if (
    queueIndexFromUrl !== null &&
    queue.pageOrder[queueIndexFromUrl] === pageNumber
  ) {
    return queueIndexFromUrl;
  }

  const index = findQueuePageIndex(queue, pageNumber);
  return index >= 0 ? index : null;
}

function toQueueState(
  flow: HifzFlowType,
  response: HifzQueueResponse,
  currentPageIndex: number,
): HifzSessionQueue {
  return {
    type: flow,
    items: response.items,
    pageOrder: response.pageOrder,
    currentPageIndex,
    rated: buildRecoveredRatedProgressIds(
      response.items,
      response.pageOrder,
      currentPageIndex,
    ),
  };
}

interface HifzQueueRecoveryError {
  message: string;
  requiresSignIn?: boolean;
}

export function ReadPageWorkspace({
  pageNumber,
  layout,
  wordTranslations,
  currentSurahId,
  currentJuzNumber,
  themeSurahId,
  audioTracks,
  ayahDetails,
  memorizedAyahKeys,
  readingAyahIds,
  mushafHeader,
  initialReadMode = null,
  forceHifzRevealByThirds = false,
  hifzFlow = null,
  hifzNavigationSearch = null,
  personalizationPageNumber = null,
}: ReadPageWorkspaceProps) {
  const lastSyncedPageRef = useRef<number | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    activePlaybackAyahKey,
    allTracksEndedSignal,
    isAudioVisible,
    pauseAudioPlayback,
    requestAudioAutoplay,
    restartAudioPlayback,
    startAudioFromAyah,
    setPlayableAyahKeys,
    setAudioVisible,
    syncAudioTracks,
    toggleAudioVisibility,
  } = useReadAudio();
  const { mode, setMode } = useReadMode();
  const appliedInitialModeRef = useRef(false);
  const audioEnabledForMode = mode === "read" || mode === "hifz";
  const audioDiscovered = useSyncExternalStore(
    subscribeAudioDiscovery,
    getAudioDiscoverySnapshot,
    () => true,
  );
  const [showJumpControls, setShowJumpControls] = useState(false);
  const [tasmiRevealedLines, setTasmiRevealedLines] = useState(0);
  const totalLineCount =
    hifzFlow === "review"
      ? Math.max(layout.lines.filter((l) => l.type === "text").length, 1)
      : 15;
  const tasmiAllRevealed = hifzFlow === "review" && tasmiRevealedLines >= totalLineCount;
  const showTasmiOverlay = hifzFlow === "review" && !tasmiAllRevealed;
  const handleTasmiTap = useCallback(() => {
    setTasmiRevealedLines((prev) => Math.min(prev + 1, totalLineCount));
  }, [totalLineCount]);
  const [memorizeHideMushaf, setMemorizeHideMushaf] = useState(false);
  const [sessionStartTime] = useState(() => Date.now());
  const [sessionPagesCompleted, setSessionPagesCompleted] = useState(0);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [resolvedMemorizedAyahKeys, setResolvedMemorizedAyahKeys] = useState(
    memorizedAyahKeys,
  );
  const [shouldTrackExposure, setShouldTrackExposure] = useState(false);
  const [memorizeChunkAyahKeys, setMemorizeChunkAyahKeys] = useState<string[] | null>(
    null,
  );
  const [nextQueuePage, setNextQueuePage] =
    useState<HifzQueuePagePointer | null>(null);
  const [previousQueuePage, setPreviousQueuePage] =
    useState<HifzQueuePagePointer | null>(null);
  const [isRecoveringHifzQueue, setIsRecoveringHifzQueue] = useState(false);
  const [hifzQueueTotalPages, setHifzQueueTotalPages] = useState(0);
  const [hifzQueueRecoveryError, setHifzQueueRecoveryError] =
    useState<HifzQueueRecoveryError | null>(null);
  const hifzQueueIndex = useMemo(() => {
    const rawValue = searchParams.get("qi");
    if (!rawValue) {
      return null;
    }

    const parsed = Number.parseInt(rawValue, 10);
    if (!Number.isInteger(parsed) || parsed < 0) {
      return null;
    }

    return parsed;
  }, [searchParams]);
  const [isCurrentPageImageReady, setIsCurrentPageImageReady] = useState(false);
  const [memorizeViewportInset, setMemorizeViewportInset] = useState(0);
  const contentBottomPadding =
    hifzFlow === "memorize" && memorizeViewportInset > 0
      ? memorizeViewportInset + 16
      : undefined;
  const useLightweightReadViewer = hifzFlow === null && initialReadMode !== "hifz";

  const applyQueuePointers = useCallback(
    (
      queue: Pick<HifzSessionQueue, "pageOrder">,
    ) => {
      setPreviousQueuePage(getAdjacentQueuePageFromQueue(queue, pageNumber, -1));
      setNextQueuePage(getAdjacentQueuePageFromQueue(queue, pageNumber, 1));
      setHifzQueueTotalPages(queue.pageOrder.length);
    },
    [pageNumber],
  );

  const markAudioDiscovered = useCallback(() => {
    if (!audioDiscovered) {
      window.localStorage.setItem(AUDIO_DISCOVERY_STORAGE_KEY, "1");
      window.dispatchEvent(new Event("miftah:audio-discovery"));
    }
  }, [audioDiscovered]);

  const handleToggleAudio = useCallback(() => {
    if (!audioEnabledForMode) {
      return;
    }
    toggleAudioVisibility();
    markAudioDiscovered();
  }, [audioEnabledForMode, markAudioDiscovered, toggleAudioVisibility]);

  const [hifzRevealByThirdsEnabled, setHifzRevealByThirdsEnabled] = useState(
    () => {
      if (forceHifzRevealByThirds) {
        return true;
      }
      if (typeof window === "undefined") {
        return false;
      }
      return (
        window.localStorage.getItem(HIFZ_REVEAL_BY_THIRDS_STORAGE_KEY) === "1"
      );
    },
  );

  useEffect(() => {
    window.localStorage.setItem(
      HIFZ_REVEAL_BY_THIRDS_STORAGE_KEY,
      hifzRevealByThirdsEnabled ? "1" : "0",
    );
  }, [hifzRevealByThirdsEnabled]);

  useEffect(() => {
    if (appliedInitialModeRef.current) {
      return;
    }
    setMode(initialReadMode ?? "read");
    appliedInitialModeRef.current = true;
  }, [initialReadMode, setMode]);

  useEffect(() => {
    rememberLastReadPage(pageNumber);
  }, [pageNumber]);

  useEffect(() => {
    if (hifzFlow === null) {
      setNextQueuePage(null);
      setPreviousQueuePage(null);
      setIsRecoveringHifzQueue(false);
      setHifzQueueRecoveryError(null);
      return;
    }

    const existingQueue = loadQueue(hifzFlow);
    const existingQueueIndex = existingQueue
      ? resolveQueueIndex(existingQueue, pageNumber, hifzQueueIndex)
      : null;
    if (existingQueue && existingQueueIndex !== null) {
      const recoveredQueue =
        recoverQueueState(hifzFlow, pageNumber, existingQueueIndex) ?? existingQueue;
      applyQueuePointers(recoveredQueue);
      setIsRecoveringHifzQueue(false);
      setHifzQueueRecoveryError(null);
      return;
    }

    const abortController = new AbortController();
    setIsRecoveringHifzQueue(true);
    setHifzQueueRecoveryError(null);

    void fetch(`/api/hifz/queue?type=${hifzFlow}`, {
      cache: "no-store",
      signal: abortController.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw { status: response.status };
        }

        return (await response.json()) as HifzQueueResponse;
      })
      .then((queueResponse) => {
        const queuePageIndex = resolveQueueIndex(
          queueResponse,
          pageNumber,
          hifzQueueIndex,
        );
        if (queuePageIndex === null) {
          setPreviousQueuePage(null);
          setNextQueuePage(null);
          setHifzQueueRecoveryError({
            message: "Sesi hafalan semasa sudah berubah. Kembali ke Hafal untuk buka semula susunan hari ini.",
          });
          return;
        }

        const recoveredQueue = saveQueueState(
          hifzFlow,
          queueResponse.items,
          queuePageIndex,
          buildRecoveredRatedProgressIds(
            queueResponse.items,
            queueResponse.pageOrder,
            queuePageIndex,
          ),
        );
        applyQueuePointers(
          recoveredQueue ?? toQueueState(hifzFlow, queueResponse, queuePageIndex),
        );
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        console.error("[ReadPageWorkspace] Failed to recover hifz queue", error);
        setPreviousQueuePage(null);
        setNextQueuePage(null);
        const status =
          typeof error === "object" &&
          error !== null &&
          "status" in error &&
          typeof error.status === "number"
            ? error.status
            : null;
        setHifzQueueRecoveryError(
          status === 401
            ? {
                message: "Sesi hafalan perlukan akaun aktif. Log masuk dahulu kemudian buka semula dari Hafal.",
                requiresSignIn: true,
              }
            : {
                message: "Sesi hafalan tak dapat dipulihkan sekarang. Kembali ke Hafal dan cuba buka semula.",
              },
        );
      })
      .finally(() => {
        if (!abortController.signal.aborted) {
          setIsRecoveringHifzQueue(false);
        }
      });

    return () => {
      abortController.abort();
    };
  }, [applyQueuePointers, hifzFlow, hifzQueueIndex, pageNumber]);

  useEffect(() => {
    setIsCurrentPageImageReady(false);
  }, [pageNumber]);

  // Font preloading for adjacent pages is handled by MushafLivePage

  useEffect(() => {
    if (hifzFlow !== null || !isCurrentPageImageReady) {
      return;
    }

    if (lastSyncedPageRef.current === pageNumber) {
      return;
    }

    lastSyncedPageRef.current = pageNumber;

    return scheduleIdleTask(() => {
      void fetch("/api/reading/state", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ page: pageNumber }),
        keepalive: true,
      }).catch((error: unknown) => {
        console.error("[ReadPageWorkspace] Failed to sync reading state:", error);
      });
    }, 900);
  }, [hifzFlow, isCurrentPageImageReady, pageNumber]);

  useEffect(() => {
    setResolvedMemorizedAyahKeys(memorizedAyahKeys);
  }, [memorizedAyahKeys]);

  useEffect(() => {
    if (hifzFlow !== null || !isCurrentPageImageReady) {
      setShouldTrackExposure(false);
      return;
    }

    return scheduleIdleTask(() => {
      setShouldTrackExposure(true);
    }, 1500);
  }, [hifzFlow, isCurrentPageImageReady, pageNumber]);

  useEffect(() => {
    if (!audioEnabledForMode) {
      setAudioVisible(false);
      setPlayableAyahKeys(null);
      syncAudioTracks(pageNumber, []);
      return;
    }

    syncAudioTracks(pageNumber, audioTracks);
  }, [
    audioEnabledForMode,
    audioTracks,
    pageNumber,
    setAudioVisible,
    setPlayableAyahKeys,
    syncAudioTracks,
  ]);

  useEffect(() => {
    if (hifzFlow !== "memorize") {
      setPlayableAyahKeys(null);
      return;
    }

    setPlayableAyahKeys(memorizeChunkAyahKeys);
  }, [
    hifzFlow,
    memorizeChunkAyahKeys,
    setPlayableAyahKeys,
  ]);

  // Pre-cache audio for current and next pages when in hifz flow
  useEffect(() => {
    if (hifzFlow === null || audioTracks.length === 0) return;
    const urls = audioTracks.map((t) => t.audioUrl);
    void preCacheAudioUrls(urls);
  }, [hifzFlow, audioTracks]);

  useEffect(() => {
    if (!personalizationPageNumber || hifzFlow === null) {
      return;
    }

    const abortController = new AbortController();
    let cancelIdleTask = () => {};

    cancelIdleTask = scheduleIdleTask(() => {
      void fetch(`/api/read/personalization?page=${personalizationPageNumber}`, {
        cache: "no-store",
        signal: abortController.signal,
      })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error("Read personalization request failed");
          }
          return (await response.json()) as { memorizedAyahKeys?: string[] };
        })
        .then((payload) => {
          if (!Array.isArray(payload.memorizedAyahKeys)) {
            return;
          }
          setResolvedMemorizedAyahKeys(payload.memorizedAyahKeys);
        })
        .catch((error: unknown) => {
          if (
            error instanceof DOMException &&
            error.name === "AbortError"
          ) {
            return;
          }
          console.error("[read/page] Failed to hydrate memorized ayah keys", error);
        });
    }, 1800);

    return () => {
      cancelIdleTask();
      abortController.abort();
    };
  }, [hifzFlow, personalizationPageNumber]);

  useEffect(() => {
    if (hifzFlow !== null) {
      if (previousQueuePage) {
        router.prefetch(
          buildQueuePageHref(
            hifzFlow,
            previousQueuePage.pageNumber,
            previousQueuePage.index,
          ),
        );
      }
      if (nextQueuePage) {
        router.prefetch(
          buildQueuePageHref(hifzFlow, nextQueuePage.pageNumber, nextQueuePage.index),
        );
      }
      return;
    }

    if (!hifzNavigationSearch) {
      return;
    }

    const previousHref =
      pageNumber > 1 ? `/read/${pageNumber - 1}?${hifzNavigationSearch}` : null;
    const nextHref =
      pageNumber < 604 ? `/read/${pageNumber + 1}?${hifzNavigationSearch}` : null;

    if (previousHref) {
      router.prefetch(previousHref);
    }
    if (nextHref) {
      router.prefetch(nextHref);
    }
  }, [
    hifzFlow,
    hifzNavigationSearch,
    nextQueuePage,
    pageNumber,
    previousQueuePage,
    router,
  ]);

  const previousPageHref = useMemo(() => {
    if (hifzFlow !== null) {
      return previousQueuePage
        ? buildQueuePageHref(
            hifzFlow,
            previousQueuePage.pageNumber,
            previousQueuePage.index,
          )
        : null;
    }

    if (pageNumber <= 1) {
      return null;
    }

    return hifzNavigationSearch
      ? `/read/${pageNumber - 1}?${hifzNavigationSearch}`
      : `/read/${pageNumber - 1}`;
  }, [hifzFlow, hifzNavigationSearch, pageNumber, previousQueuePage]);

  const nextPageHref = useMemo(() => {
    if (hifzFlow !== null) {
      return nextQueuePage
        ? buildQueuePageHref(hifzFlow, nextQueuePage.pageNumber, nextQueuePage.index)
        : null;
    }

    if (pageNumber >= 604) {
      return null;
    }

    return hifzNavigationSearch
      ? `/read/${pageNumber + 1}?${hifzNavigationSearch}`
      : `/read/${pageNumber + 1}`;
  }, [hifzFlow, hifzNavigationSearch, nextQueuePage, pageNumber]);

  const handleNavigatePrevPage = useCallback(() => {
    if (!previousPageHref) {
      return;
    }
    router.push(previousPageHref);
  }, [previousPageHref, router]);
  const handleNavigateNextPage = useCallback(() => {
    if (!nextPageHref) {
      return;
    }
    router.push(nextPageHref);
  }, [nextPageHref, router]);
  const handleMushafTap = useCallback(() => {
    if (!audioEnabledForMode) {
      return;
    }
    toggleAudioVisibility();
    markAudioDiscovered();
  }, [audioEnabledForMode, markAudioDiscovered, toggleAudioVisibility]);
  const handleAyahAudioTap = useCallback((ayahKey: string) => {
    if (!audioEnabledForMode) {
      return;
    }

    startAudioFromAyah(ayahKey);
    markAudioDiscovered();
  }, [audioEnabledForMode, markAudioDiscovered, startAudioFromAyah]);
  const handleMemorizeChunkListen = useCallback(() => {
    setAudioVisible(true);
    restartAudioPlayback();
    requestAudioAutoplay();
    markAudioDiscovered();
  }, [
    markAudioDiscovered,
    requestAudioAutoplay,
    restartAudioPlayback,
    setAudioVisible,
  ]);
  const handleMemorizeChunkPause = useCallback(() => {
    pauseAudioPlayback();
  }, [pauseAudioPlayback]);

  const renderHifzQueueRecoveryPanel = (
    title: string,
    message: string,
    options?: { bottomOffsetPx?: number; requiresSignIn?: boolean },
  ) => (
    <div
      className="fixed inset-x-0 bottom-0 z-50 border-t border-stone-200 bg-white/95 px-4 py-5 text-center shadow-lg backdrop-blur-md dark:border-stone-700 dark:bg-stone-900/95"
      style={{ bottom: options?.bottomOffsetPx ?? 0 }}
    >
      <p className="text-sm font-semibold text-stone-900 dark:text-stone-100">
        {title}
      </p>
      <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
        {message}
      </p>
      <div className="mt-4 flex justify-center gap-3">
        {options?.requiresSignIn ? (
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

  return (
    <div style={{ paddingBottom: contentBottomPadding }}>
      {hifzFlow && hifzQueueTotalPages > 0 && !sessionComplete ? (
        <HifzSessionBar
          flow={hifzFlow}
          totalPages={hifzQueueTotalPages}
          completedPages={sessionPagesCompleted}
          startTime={sessionStartTime}
        />
      ) : null}

      {sessionComplete && hifzFlow ? (
        <HifzSessionComplete
          flow={hifzFlow}
          pagesCompleted={sessionPagesCompleted}
          timeElapsedMs={Date.now() - sessionStartTime}
        />
      ) : null}

      {shouldTrackExposure ? (
        <FahamExposureTracker
          payload={{
            ayahIds: readingAyahIds,
            pageNumber,
            sourceType: "reading_page",
            surahId: currentSurahId,
          }}
        />
      ) : null}

      {!hifzFlow ? (
        <ReadModeTools
          themeSurahId={themeSurahId}
          hifzRevealByThirdsEnabled={hifzRevealByThirdsEnabled}
          onHifzRevealByThirdsChange={setHifzRevealByThirdsEnabled}
          showJumpControls={showJumpControls}
          onToggleJumpControls={() =>
            setShowJumpControls((current) => !current)
          }
          audioEnabled={audioEnabledForMode}
          isAudioVisible={isAudioVisible}
          onToggleAudio={handleToggleAudio}
        />
      ) : null}

      <div className="hidden sm:block">
        <div
          className={`overflow-hidden transition-[max-height,opacity,transform] duration-300 ${
            showJumpControls
              ? "max-h-[420px] translate-y-0 opacity-100"
              : "pointer-events-none max-h-0 -translate-y-1 opacity-0"
          }`}
          aria-hidden={!showJumpControls}
        >
          <div className="pt-1">
            {showJumpControls ? (
              <ReadJumpControls
                currentPage={pageNumber}
                currentSurahId={currentSurahId}
                currentJuzNumber={currentJuzNumber}
              />
            ) : null}
          </div>
        </div>
      </div>

      <div className="sm:hidden">
        {showJumpControls ? (
          <div
            className="fixed inset-0 z-[55] bg-black/30"
            onClick={() => setShowJumpControls(false)}
          >
            <section
              className="absolute inset-x-0 bottom-0 max-h-[78vh] overflow-y-auto rounded-t-[28px] border border-b-0 border-stone-200 bg-white/98 px-4 pb-[calc(env(safe-area-inset-bottom)+18px)] pt-4 shadow-[0_-18px_48px_rgba(0,0,0,0.18)] backdrop-blur dark:border-stone-700 dark:bg-stone-900/97"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                    Lompat di luar mushaf
                  </p>
                  <p className="text-xs text-stone-500 dark:text-stone-400">
                    Pilih halaman, surah, atau juz tanpa menyesakkan bacaan.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowJumpControls(false)}
                  className="inline-flex min-h-10 items-center rounded-full border border-stone-300 px-3 text-sm font-medium text-stone-700 transition hover:bg-stone-100 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-800"
                >
                  Tutup
                </button>
              </div>

              <ReadJumpControls
                currentPage={pageNumber}
                currentSurahId={currentSurahId}
                currentJuzNumber={currentJuzNumber}
              />
            </section>
          </div>
        ) : null}
      </div>

      {mushafHeader}

      <div className="mb-1 flex w-full justify-end gap-2">
        {previousPageHref ? (
          <Link
            href={previousPageHref}
            title="Halaman Sebelum"
            aria-label="Halaman Sebelum"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-stone-300 bg-white text-sm font-medium text-stone-700 shadow-sm transition hover:bg-stone-50 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700"
          >
            {"<"}
          </Link>
        ) : (
          <button
            type="button"
            disabled
            aria-label="Halaman Sebelum"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-stone-200 bg-stone-100 text-sm font-medium text-stone-400 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-600"
          >
            {"<"}
          </button>
        )}

        {nextPageHref ? (
          <Link
            href={nextPageHref}
            title="Halaman Seterusnya"
            aria-label="Halaman Seterusnya"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-stone-300 bg-white text-sm font-medium text-stone-700 shadow-sm transition hover:bg-stone-50 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700"
          >
            {">"}
          </Link>
        ) : (
          <button
            type="button"
            disabled
            aria-label="Halaman Seterusnya"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-stone-200 bg-stone-100 text-sm font-medium text-stone-400 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-600"
          >
            {">"}
          </button>
        )}
      </div>

      <div className="relative">
        {showTasmiOverlay && (
          <HifzTasmiOverlay
            totalLines={totalLineCount}
            revealedLines={tasmiRevealedLines}
            onTap={handleTasmiTap}
            onRevealTo={setTasmiRevealedLines}
          />
        )}
        {memorizeHideMushaf && (
          <div className="absolute inset-0 z-30 flex items-center justify-center rounded-2xl bg-stone-900/80 backdrop-blur-md">
            <p className="text-center text-lg font-semibold text-white/90">
              Cuba baca tanpa melihat
            </p>
          </div>
        )}
        {useLightweightReadViewer ? (
          <ReadOnlyMushafPageView
            key={pageNumber}
            pageNumber={pageNumber}
            layout={layout}
            onNavigatePrevPage={handleNavigatePrevPage}
            onNavigateNextPage={handleNavigateNextPage}
            onCanvasTap={handleMushafTap}
            onAyahAudioTap={audioEnabledForMode ? handleAyahAudioTap : undefined}
            audioDiscovered={audioDiscovered}
            onAudioDiscovered={markAudioDiscovered}
            onReadyChange={setIsCurrentPageImageReady}
            activePlaybackAyahKey={activePlaybackAyahKey}
          />
        ) : (
          <MushafPageView
            key={pageNumber}
            pageNumber={pageNumber}
            layout={layout}
            wordTranslations={wordTranslations}
            ayahDetails={ayahDetails}
            memorizedAyahKeys={resolvedMemorizedAyahKeys}
            hifzRevealByThirdsEnabled={!hifzFlow && hifzRevealByThirdsEnabled}
            onNavigatePrevPage={handleNavigatePrevPage}
            onNavigateNextPage={handleNavigateNextPage}
            onCanvasTap={handleMushafTap}
            onAyahAudioTap={audioEnabledForMode ? handleAyahAudioTap : undefined}
            audioDiscovered={audioDiscovered}
            onAudioDiscovered={markAudioDiscovered}
            onReadyChange={setIsCurrentPageImageReady}
            activePlaybackAyahKey={activePlaybackAyahKey}
            isAudioDockVisible={isAudioVisible}
            onPlayableAyahKeysChange={hifzFlow === "memorize" ? undefined : setPlayableAyahKeys}
          />
        )}
      </div>

      {hifzFlow === "review" && (
        isRecoveringHifzQueue ? (
          renderHifzQueueRecoveryPanel(
            "Menyambung sesi uji hafalan...",
            "Kami sedang bina semula susunan halaman semasa.",
          )
        ) : hifzQueueRecoveryError ? (
          renderHifzQueueRecoveryPanel(
            "Sesi tergendala",
            hifzQueueRecoveryError.message,
            { requiresSignIn: hifzQueueRecoveryError.requiresSignIn },
          )
        ) : (
          <HifzInlineRating
            flowType={hifzFlow}
            pageNumber={pageNumber}
            queueIndex={hifzQueueIndex ?? 0}
            visible={tasmiAllRevealed}
            onTasmiSuccess={() => setTasmiRevealedLines(totalLineCount)}
            onSessionComplete={() => setSessionComplete(true)}
            onPageComplete={() => setSessionPagesCompleted((n) => n + 1)}
          />
        )
      )}

      {hifzFlow === "memorize" && (
        isRecoveringHifzQueue ? (
          renderHifzQueueRecoveryPanel(
            "Menyambung sesi hafalan...",
            "Kami sedang bina semula chunk dan susunan halaman semasa.",
            { bottomOffsetPx: isAudioVisible ? 112 : 0 },
          )
        ) : hifzQueueRecoveryError ? (
          renderHifzQueueRecoveryPanel(
            "Sesi tergendala",
            hifzQueueRecoveryError.message,
            {
              bottomOffsetPx: isAudioVisible ? 112 : 0,
              requiresSignIn: hifzQueueRecoveryError.requiresSignIn,
            },
          )
        ) : (
          <HifzMemorizeStepper
            bottomOffsetPx={isAudioVisible ? 112 : 0}
            pageNumber={pageNumber}
            queueIndex={hifzQueueIndex ?? 0}
            audioFinishedSignal={allTracksEndedSignal}
            onChunkAyahKeysChange={setMemorizeChunkAyahKeys}
            onChunkListen={handleMemorizeChunkListen}
            onChunkPause={handleMemorizeChunkPause}
            onMushafHide={setMemorizeHideMushaf}
            onViewportInsetChange={setMemorizeViewportInset}
            onSessionComplete={() => setSessionComplete(true)}
            onPageComplete={() => setSessionPagesCompleted((n) => n + 1)}
          />
        )
      )}
    </div>
  );
}
