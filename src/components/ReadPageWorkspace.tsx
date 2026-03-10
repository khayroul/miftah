"use client";

import { useCallback, useState } from "react";
import {
  MushafPageView,
  type MushafAyahDetail,
} from "@/components/MushafPageView";
import type { PageAudioTrack } from "@/components/PageAudioControls";
import { ReadModeTools } from "@/components/ReadModeTools";
import { useRouter } from "next/navigation";
import type { MushafPageManifest, MushafWordTranslationMap } from "@/types/mushaf";

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
  surahOptions,
  juzOptions,
  audioTracks,
  ayahDetails,
}: ReadPageWorkspaceProps) {
  const router = useRouter();
  const [playingAyahKey, setPlayingAyahKey] = useState<string | null>(null);

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
      />

      <MushafPageView
        key={pageNumber}
        pageNumber={pageNumber}
        imageAvailable={imageAvailable}
        thumbnailAvailable={thumbnailAvailable}
        manifest={manifest}
        wordTranslations={wordTranslations}
        ayahDetails={ayahDetails}
        playingAyahKey={playingAyahKey}
        onNavigatePrevPage={handleNavigatePrevPage}
        onNavigateNextPage={handleNavigateNextPage}
      />
    </>
  );
}
