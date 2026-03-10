"use client";

import { useCallback, useEffect, useState } from "react";
import {
  MushafPageView,
  type MushafAyahDetail,
} from "@/components/MushafPageView";
import type { PageAudioTrack } from "@/components/PageAudioControls";
import { ReadModeTools } from "@/components/ReadModeTools";
import { useRouter } from "next/navigation";
import type { MushafPageManifest, MushafWordTranslationMap } from "@/types/mushaf";
import type { ReactNode } from "react";

interface SurahOption {
  surah: number;
  name: string;
  page: number;
}

interface JuzOption {
  juz: number;
  page: number;
}

interface ReadPageWorkspaceProps {
  pageNumber: number;
  imageAvailable: boolean;
  thumbnailAvailable: boolean;
  manifest: MushafPageManifest | null;
  wordTranslations: MushafWordTranslationMap;
  currentSurahId: number;
  currentJuzNumber: number;
  themeSurahId: number;
  surahOptions: SurahOption[];
  juzOptions: JuzOption[];
  audioTracks: PageAudioTrack[];
  ayahDetails: MushafAyahDetail[];
  memorizedAyahKeys: string[];
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
  surahOptions,
  juzOptions,
  audioTracks,
  ayahDetails,
  memorizedAyahKeys,
  mushafHeader,
}: ReadPageWorkspaceProps) {
  const router = useRouter();
  const [playingAyahKey, setPlayingAyahKey] = useState<string | null>(null);
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

  const handlePlaybackAyahChange = useCallback((ayahKey: string | null) => {
    setPlayingAyahKey(ayahKey);
  }, []);
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

  return (
    <>
      <ReadModeTools
        currentPage={pageNumber}
        currentSurahId={currentSurahId}
        currentJuzNumber={currentJuzNumber}
        themeSurahId={themeSurahId}
        surahOptions={surahOptions}
        juzOptions={juzOptions}
        audioTracks={audioTracks}
        onPlaybackAyahChange={handlePlaybackAyahChange}
        hifzRevealByThirdsEnabled={hifzRevealByThirdsEnabled}
        onHifzRevealByThirdsChange={setHifzRevealByThirdsEnabled}
      />

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
        playingAyahKey={playingAyahKey}
        onNavigatePrevPage={handleNavigatePrevPage}
        onNavigateNextPage={handleNavigateNextPage}
      />
    </>
  );
}
