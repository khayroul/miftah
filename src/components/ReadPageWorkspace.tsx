"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  MushafPageView,
  type MushafAyahDetail,
} from "@/components/MushafPageView";
import { FahamExposureTracker } from "@/components/FahamExposureTracker";
import { ReadJumpControls } from "@/components/ReadJumpControls";
import { ReadModeTools } from "@/components/ReadModeTools";
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
  const [tasmiRevealedLines, setTasmiRevealedLines] = useState(0);
  const totalLineCount = manifest?.words
    ? Math.max(new Set(manifest.words.map((w) => Math.round(w.y))).size, 1)
    : 15;
  const tasmiAllRevealed = hifzFlow === "review" && tasmiRevealedLines >= totalLineCount;
  const showTasmiOverlay = hifzFlow === "review" && !tasmiAllRevealed;
  const handleTasmiTap = useCallback(() => {
    setTasmiRevealedLines((prev) => Math.min(prev + 1, totalLineCount));
  }, [totalLineCount]);
  const [memorizeHideMushaf, setMemorizeHideMushaf] = useState(false);
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
      <FahamExposureTracker
        payload={{
          ayahIds: readingAyahIds,
          pageNumber,
          sourceType: "reading_page",
          surahId: currentSurahId,
        }}
      />

      {!hifzFlow && (
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
      )}

      <div
        className={`overflow-hidden transition-[max-height,opacity,transform] duration-300 ${
          showJumpControls
            ? "max-h-[420px] translate-y-0 opacity-100"
            : "pointer-events-none max-h-0 -translate-y-1 opacity-0"
        }`}
        aria-hidden={!showJumpControls}
      >
        <div className="pt-1">
          <ReadJumpControls
            currentPage={pageNumber}
            currentSurahId={currentSurahId}
            currentJuzNumber={currentJuzNumber}
            surahOptions={jumpSurahOptions}
            juzOptions={jumpJuzOptions}
          />
        </div>
      </div>

      {mushafHeader}

      <div className="mb-2 flex w-full justify-end">
        <div className="flex items-center gap-2">
          {pageNumber > 1 ? (
            <Link
              href={`/read/${pageNumber - 1}`}
              title="Halaman Sebelum"
              className="inline-flex h-10 items-center gap-1.5 rounded-full border border-stone-300 bg-white px-4 text-[15px] font-medium text-stone-700 shadow-sm transition hover:bg-stone-50 sm:h-11 sm:text-base dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700"
            >
              <svg
                className="h-4 w-4"
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
              className="inline-flex h-10 items-center gap-1.5 rounded-full border border-stone-200 bg-stone-100 px-4 text-[15px] font-medium text-stone-400 sm:h-11 sm:text-base dark:border-stone-700 dark:bg-stone-800 dark:text-stone-600"
            >
              <svg
                className="h-4 w-4"
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
              className="inline-flex h-10 items-center gap-1.5 rounded-full border border-stone-300 bg-white px-4 text-[15px] font-medium text-stone-700 shadow-sm transition hover:bg-stone-50 sm:h-11 sm:text-base dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700"
            >
              Next
              <svg
                className="h-4 w-4"
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
              className="inline-flex h-10 items-center gap-1.5 rounded-full border border-stone-200 bg-stone-100 px-4 text-[15px] font-medium text-stone-400 sm:h-11 sm:text-base dark:border-stone-700 dark:bg-stone-800 dark:text-stone-600"
            >
              Next
              <svg
                className="h-4 w-4"
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
          memorizedAyahKeys={memorizedAyahKeys}
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
