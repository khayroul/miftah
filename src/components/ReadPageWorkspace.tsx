"use client";

import { useCallback, useEffect, useState } from "react";
import {
  MushafPageView,
  type MushafAyahDetail,
} from "@/components/MushafPageView";
import { FahamExposureTracker } from "@/components/FahamExposureTracker";
import { ReadAudioDock } from "@/components/ReadAudioDock";
import { ReadJumpControls } from "@/components/ReadJumpControls";
import { ReadModeTools } from "@/components/ReadModeTools";
import type { ReadAudioTrack } from "@/lib/pageAudioTracks";
import { rememberLastReadPage } from "@/lib/readingProgressStorage";
import { useRouter } from "next/navigation";
import { useReadMode } from "@/lib/useReadMode";
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
  const { mode } = useReadMode();
  const [audioDockVisible, setAudioDockVisible] = useState(false);
  const [showJumpControls, setShowJumpControls] = useState(false);
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

  // Scroll listener removed to allow audio dock to remain visible while scrolling

  const handleNavigatePrevPage = useCallback(() => {
    if (pageNumber <= 1) {
      return;
    }
    setAudioDockVisible(false);
    router.push(`/read/${pageNumber - 1}`);
  }, [pageNumber, router]);
  const handleNavigateNextPage = useCallback(() => {
    if (pageNumber >= 604) {
      return;
    }
    setAudioDockVisible(false);
    router.push(`/read/${pageNumber + 1}`);
  }, [pageNumber, router]);
  const handleMushafTap = useCallback(() => {
    setAudioDockVisible((current) => !current);
  }, []);

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

      {mode === "read" && (
        <div className="flex w-full justify-between items-center px-1 mb-2">
          {pageNumber > 1 ? (
            <Link
              href={`/read/${pageNumber - 1}`}
              title="Halaman Sebelum"
              className="flex items-center justify-center p-2 rounded-full border border-stone-300 bg-white text-stone-700 shadow-sm transition hover:bg-stone-50 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
          ) : (
            <div className="w-9 h-9" />
          )}
          {pageNumber < 604 ? (
            <Link
              href={`/read/${pageNumber + 1}`}
              title="Halaman Seterusnya"
              className="flex items-center justify-center p-2 rounded-full border border-stone-300 bg-white text-stone-700 shadow-sm transition hover:bg-stone-50 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          ) : (
            <div className="w-9 h-9" />
          )}
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
        hifzRevealByThirdsEnabled={hifzRevealByThirdsEnabled}
        onNavigatePrevPage={handleNavigatePrevPage}
        onNavigateNextPage={handleNavigateNextPage}
        onCanvasTap={handleMushafTap}
      />

      <ReadAudioDock
        key={`audio-dock-${pageNumber}`}
        tracks={audioTracks}
        visible={audioDockVisible}
        onRequestClose={() => setAudioDockVisible(false)}
      />
    </>
  );
}
