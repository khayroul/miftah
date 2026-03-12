"use client";

import { useCallback, useEffect, useState } from "react";
import {
  MushafPageView,
  type MushafAyahDetail,
} from "@/components/MushafPageView";
import { FahamExposureTracker } from "@/components/FahamExposureTracker";
import { ReadJumpControls } from "@/components/ReadJumpControls";
import { ReadModeTools } from "@/components/ReadModeTools";
import { useReadAudio } from "@/components/ReadAudioProvider";
import type { ReadAudioTrack } from "@/lib/pageAudioTracks";
import { rememberLastReadPage } from "@/lib/readingProgressStorage";
import { useRouter } from "next/navigation";
import type { JuzJumpTarget, SurahJumpTarget } from "@/lib/readNavigation";
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
}

const HIFZ_REVEAL_BY_THIRDS_STORAGE_KEY = "miftah:read:hifz-reveal-by-thirds";

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
}: ReadPageWorkspaceProps) {
  const router = useRouter();
  const {
    activePlaybackAyahKey,
    isAudioVisible,
    syncAudioTracks,
    toggleAudioVisibility,
  } = useReadAudio();
  const [audioDiscovered, setAudioDiscovered] = useState(() => {
    if (typeof window === "undefined") {
      return true;
    }
    return window.localStorage.getItem("miftah:audio:discovered") === "1";
  });
  const [showJumpControls, setShowJumpControls] = useState(false);

  const markAudioDiscovered = useCallback(() => {
    if (!audioDiscovered) {
      setAudioDiscovered(true);
      window.localStorage.setItem("miftah:audio:discovered", "1");
    }
  }, [audioDiscovered]);

  const handleToggleAudio = useCallback(() => {
    toggleAudioVisibility();
    markAudioDiscovered();
  }, [markAudioDiscovered, toggleAudioVisibility]);

  const [hifzRevealByThirdsEnabled, setHifzRevealByThirdsEnabled] = useState(
    () => {
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
    rememberLastReadPage(pageNumber);
  }, [pageNumber]);

  useEffect(() => {
    syncAudioTracks(pageNumber, audioTracks);
  }, [audioTracks, pageNumber, syncAudioTracks]);

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
    toggleAudioVisibility();
    markAudioDiscovered();
  }, [markAudioDiscovered, toggleAudioVisibility]);

  return (
    <>
      <FahamExposureTracker
        payload={{
          ayahIds: readingAyahIds,
          pageNumber,
          sourceType: "reading_page",
          surahId: currentSurahId,
        }}
      />

      <ReadModeTools
        themeSurahId={themeSurahId}
        hifzRevealByThirdsEnabled={hifzRevealByThirdsEnabled}
        onHifzRevealByThirdsChange={setHifzRevealByThirdsEnabled}
        showJumpControls={showJumpControls}
        onToggleJumpControls={() =>
          setShowJumpControls((current) => !current)
        }
        isAudioVisible={isAudioVisible}
        onToggleAudio={handleToggleAudio}
      />

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

      <MushafPageView
        key={pageNumber}
        pageNumber={pageNumber}
        imageAvailable={imageAvailable}
        thumbnailAvailable={thumbnailAvailable}
        manifest={manifest}
        wordTranslations={wordTranslations}
        ayahDetails={ayahDetails}
        memorizedAyahKeys={memorizedAyahKeys}
        hifzRevealByThirdsEnabled={hifzRevealByThirdsEnabled}
        onNavigatePrevPage={handleNavigatePrevPage}
        onNavigateNextPage={handleNavigateNextPage}
        onCanvasTap={handleMushafTap}
        audioDiscovered={audioDiscovered}
        onAudioDiscovered={markAudioDiscovered}
        activePlaybackAyahKey={activePlaybackAyahKey}
      />
    </>
  );
}
