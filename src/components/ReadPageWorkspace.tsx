"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  MushafPageView,
  type MushafAyahDetail,
} from "@/components/MushafPageView";
import { HifzTasmiOverlay } from "@/components/HifzTasmiOverlay";
import { HifzInlineRating } from "@/components/HifzInlineRating";
import { HifzMemorizeStepper } from "@/components/HifzMemorizeStepper";
import { useReadAudio } from "@/components/ReadAudioProvider";
import type { ReadAudioTrack } from "@/lib/pageAudioTracks";
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

  const handleNavigatePrevPage = useCallback(() => {
    if (pageNumber <= 1) {
      return;
    }
    router.push(`/read/${pageNumber - 1}`);
  }, [pageNumber, router]);
  const handleNavigateNextPage = useCallback(() => {
    if (pageNumber >= 604) {
      return;
    }
    router.push(`/read/${pageNumber + 1}`);
  }, [pageNumber, router]);
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

      <div className="mb-1 flex w-full justify-center gap-2 sm:hidden">
        {pageNumber > 1 ? (
          <Link
            href={`/read/${pageNumber - 1}`}
            title="Halaman Sebelum"
            className="inline-flex min-h-10 min-w-[5.5rem] items-center justify-center gap-1 rounded-full border border-stone-300 bg-white px-3 text-xs font-medium text-stone-700 shadow-sm transition hover:bg-stone-50 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700"
          >
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Prev
          </Link>
        ) : (
          <button
            type="button"
            disabled
            aria-label="Halaman Sebelum"
            className="inline-flex min-h-10 min-w-[5.5rem] items-center justify-center gap-1 rounded-full border border-stone-200 bg-stone-100 px-3 text-xs font-medium text-stone-400 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-600"
          >
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Prev
          </button>
        )}

        {pageNumber < 604 ? (
          <Link
            href={`/read/${pageNumber + 1}`}
            title="Halaman Seterusnya"
            className="inline-flex min-h-10 min-w-[5.5rem] items-center justify-center gap-1 rounded-full border border-stone-300 bg-white px-3 text-xs font-medium text-stone-700 shadow-sm transition hover:bg-stone-50 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700"
          >
            Next
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        ) : (
          <button
            type="button"
            disabled
            aria-label="Halaman Seterusnya"
            className="inline-flex min-h-10 min-w-[5.5rem] items-center justify-center gap-1 rounded-full border border-stone-200 bg-stone-100 px-3 text-xs font-medium text-stone-400 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-600"
          >
            Next
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}
      </div>

      <div className="mb-1 hidden w-full justify-end sm:flex">
        <div className="flex items-center gap-2">
          {pageNumber > 1 ? (
            <Link
              href={`/read/${pageNumber - 1}`}
              title="Halaman Sebelum"
              className="inline-flex h-9 items-center gap-1 rounded-full border border-stone-300 bg-white px-3 text-sm font-medium text-stone-700 shadow-sm transition hover:bg-stone-50 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700"
            >
              <svg
                className="h-3.5 w-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              Prev
            </Link>
          ) : (
            <button
              type="button"
              disabled
              aria-label="Halaman Sebelum"
              className="inline-flex h-9 items-center gap-1 rounded-full border border-stone-200 bg-stone-100 px-3 text-sm font-medium text-stone-400 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-600"
            >
              <svg
                className="h-3.5 w-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              Prev
            </button>
          )}

          {pageNumber < 604 ? (
            <Link
              href={`/read/${pageNumber + 1}`}
              title="Halaman Seterusnya"
              className="inline-flex h-9 items-center gap-1 rounded-full border border-stone-300 bg-white px-3 text-sm font-medium text-stone-700 shadow-sm transition hover:bg-stone-50 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700"
            >
              Next
              <svg
                className="h-3.5 w-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          ) : (
            <button
              type="button"
              disabled
              aria-label="Halaman Seterusnya"
              className="inline-flex h-9 items-center gap-1 rounded-full border border-stone-200 bg-stone-100 px-3 text-sm font-medium text-stone-400 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-600"
            >
              Next
              <svg
                className="h-3.5 w-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}
        </div>
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
