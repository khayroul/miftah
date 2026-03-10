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
import type { JuzJumpTarget, SurahJumpTarget } from "@/lib/readNavigation";
import type { MushafPageManifest, MushafWordTranslationMap } from "@/types/mushaf";
import type { ReactNode } from "react";

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

  useEffect(() => {
    const handleScroll = () => {
      setAudioDockVisible(false);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

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
