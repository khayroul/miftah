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
import { HifzTasmiOverlay } from "@/components/HifzTasmiOverlay";
import { HifzInlineRating } from "@/components/HifzInlineRating";
import { HifzMemorizeStepper } from "@/components/HifzMemorizeStepper";
import { useReadAudio } from "@/components/ReadAudioProvider";
import type { ReadAudioTrack } from "@/lib/pageAudioTracks";
import {
  buildQueuePageHref,
  getAdjacentQueuePage,
  getQueuePagePointer,
  setCurrentPageIndex,
} from "@/lib/hifz/sessionQueue";
import { rememberLastReadPage } from "@/lib/readingProgressStorage";
import { useReadMode } from "@/lib/useReadMode";
import { useRouter } from "next/navigation";
import type { JuzJumpTarget, SurahJumpTarget } from "@/lib/readNavigation";
import type { ReadMode } from "@/lib/readMode";
import type { HifzFlowType } from "@/lib/hifz/sessionQueue";
import type { MushafPageManifest, MushafWordTranslationMap } from "@/types/mushaf";
import type { ReactNode } from "react";
import Link from "next/link";

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

const ReadModeTools = dynamic(
  () =>
    import("@/components/ReadModeTools").then(
      (module) => module.ReadModeTools,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-3 sm:space-y-4" aria-hidden>
        <div className="flex w-full flex-col items-stretch justify-center gap-3 sm:items-center sm:gap-4">
          <div className="h-12 w-full rounded-full bg-stone-200/75 dark:bg-stone-800 sm:max-w-md" />
        </div>
      </div>
    ),
  },
);

interface ReadPageWorkspaceProps {
  pageNumber: number;
  imageAvailable: boolean;
  thumbnailAvailable: boolean;
  manifest: MushafPageManifest | null;
  wordTranslations: MushafWordTranslationMap;
  currentSurahId: number;
  currentJuzNumber: number;
  themeSurahId: number;
  jumpSurahOptions: SurahJumpTarget[];
  jumpJuzOptions: JuzJumpTarget[];
  audioTracks: ReadAudioTrack[];
  ayahDetails: MushafAyahDetail[];
  memorizedAyahKeys: string[];
  readingAyahIds: number[];
  mushafHeader?: ReactNode;
  initialReadMode?: ReadMode | null;
  forceHifzRevealByThirds?: boolean;
  hifzFirstWordCueEnabled?: boolean;
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

export function ReadPageWorkspace({
  pageNumber,
  imageAvailable,
  thumbnailAvailable,
  manifest,
  wordTranslations,
  currentSurahId,
  currentJuzNumber,
  themeSurahId,
  jumpSurahOptions,
  jumpJuzOptions,
  audioTracks,
  ayahDetails,
  memorizedAyahKeys,
  readingAyahIds,
  mushafHeader,
  initialReadMode = null,
  forceHifzRevealByThirds = false,
  hifzFirstWordCueEnabled = false,
  hifzFlow = null,
  hifzNavigationSearch = null,
  personalizationPageNumber = null,
}: ReadPageWorkspaceProps) {
  const router = useRouter();
  const {
    activePlaybackAyahKey,
    isAudioVisible,
    pauseAudioPlayback,
    requestAudioAutoplay,
    restartAudioPlayback,
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
  const [showReadTools, setShowReadTools] = useState(hifzFlow !== null);
  const [tasmiRevealedLines, setTasmiRevealedLines] = useState(0);
  const totalLineCount =
    hifzFlow === "review" && manifest?.words
      ? Math.max(new Set(manifest.words.map((w) => Math.round(w.y))).size, 1)
      : 15;
  const tasmiAllRevealed = hifzFlow === "review" && tasmiRevealedLines >= totalLineCount;
  const showTasmiOverlay = hifzFlow === "review" && !tasmiAllRevealed;
  const handleTasmiTap = useCallback(() => {
    setTasmiRevealedLines((prev) => Math.min(prev + 1, totalLineCount));
  }, [totalLineCount]);
  const [memorizeHideMushaf, setMemorizeHideMushaf] = useState(false);
  const [resolvedMemorizedAyahKeys, setResolvedMemorizedAyahKeys] = useState(
    memorizedAyahKeys,
  );
  const [shouldTrackExposure, setShouldTrackExposure] = useState(false);
  const [memorizeChunkAyahKeys, setMemorizeChunkAyahKeys] = useState<string[] | null>(
    null,
  );
  const [memorizeViewportInset, setMemorizeViewportInset] = useState(0);
  const contentBottomPadding =
    hifzFlow === "memorize" && memorizeViewportInset > 0
      ? memorizeViewportInset + 16
      : undefined;
  const previousQueuePage = useMemo(
    () =>
      hifzFlow === null ? null : getAdjacentQueuePage(hifzFlow, pageNumber, -1),
    [hifzFlow, pageNumber],
  );
  const nextQueuePage = useMemo(
    () =>
      hifzFlow === null ? null : getAdjacentQueuePage(hifzFlow, pageNumber, 1),
    [hifzFlow, pageNumber],
  );
  const currentQueuePage = useMemo(
    () => (hifzFlow === null ? null : getQueuePagePointer(hifzFlow, pageNumber)),
    [hifzFlow, pageNumber],
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
    setResolvedMemorizedAyahKeys(memorizedAyahKeys);
  }, [memorizedAyahKeys]);

  useEffect(() => {
    if (hifzFlow !== null) {
      setShowReadTools(false);
      return;
    }

    setShowReadTools(false);
    return scheduleIdleTask(() => {
      setShowReadTools(true);
    }, 700);
  }, [hifzFlow, pageNumber]);

  useEffect(() => {
    return scheduleIdleTask(() => {
      setShouldTrackExposure(true);
    }, 1500);
  }, [pageNumber]);

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
    if (hifzFlow === null) {
      return;
    }

    if (!currentQueuePage) {
      return;
    }

    setCurrentPageIndex(hifzFlow, currentQueuePage.index);
  }, [currentQueuePage, hifzFlow]);

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

  return (
    <div style={{ paddingBottom: contentBottomPadding }}>
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

      {!hifzFlow && showReadTools ? (
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
      ) : !hifzFlow ? (
        <section className="space-y-3 sm:space-y-4" aria-hidden>
          <div className="flex w-full flex-col items-stretch justify-center gap-3 sm:items-center sm:gap-4">
            <div className="h-12 w-full rounded-full bg-stone-200/75 dark:bg-stone-800 sm:max-w-md" />
          </div>
        </section>
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
                surahOptions={jumpSurahOptions}
                juzOptions={jumpJuzOptions}
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
                surahOptions={jumpSurahOptions}
                juzOptions={jumpJuzOptions}
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
          />
        )}
        {memorizeHideMushaf && (
          <div className="absolute inset-0 z-30 flex items-center justify-center rounded-2xl bg-stone-900/80 backdrop-blur-md">
            <p className="text-center text-lg font-semibold text-white/90">
              Cuba baca tanpa melihat
            </p>
          </div>
        )}
        <MushafPageView
          key={pageNumber}
          pageNumber={pageNumber}
          imageAvailable={imageAvailable}
          thumbnailAvailable={thumbnailAvailable}
          manifest={manifest}
          wordTranslations={wordTranslations}
          ayahDetails={ayahDetails}
          memorizedAyahKeys={resolvedMemorizedAyahKeys}
          hifzRevealByThirdsEnabled={!hifzFlow && hifzRevealByThirdsEnabled}
          onNavigatePrevPage={handleNavigatePrevPage}
          onNavigateNextPage={handleNavigateNextPage}
          onCanvasTap={handleMushafTap}
          audioDiscovered={audioDiscovered}
          onAudioDiscovered={markAudioDiscovered}
          activePlaybackAyahKey={activePlaybackAyahKey}
          isAudioDockVisible={isAudioVisible}
          onPlayableAyahKeysChange={hifzFlow === "memorize" ? undefined : setPlayableAyahKeys}
          hifzFirstWordCueEnabled={!hifzFlow && hifzFirstWordCueEnabled}
        />
      </div>

      {hifzFlow === "review" && (
        <HifzInlineRating
          flowType={hifzFlow}
          pageNumber={pageNumber}
          visible={tasmiAllRevealed}
        />
      )}

      {hifzFlow === "memorize" && (
        <HifzMemorizeStepper
          bottomOffsetPx={isAudioVisible ? 112 : 0}
          pageNumber={pageNumber}
          onChunkAyahKeysChange={setMemorizeChunkAyahKeys}
          onChunkListen={handleMemorizeChunkListen}
          onChunkPause={handleMemorizeChunkPause}
          onMushafHide={setMemorizeHideMushaf}
          onViewportInsetChange={setMemorizeViewportInset}
        />
      )}
    </div>
  );
}
