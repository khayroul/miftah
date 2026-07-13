"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { buildQueuePageHref, type HifzExerciseFlow, type HifzFlowType } from "@/features/hifz";
import type { MushafAyahDetail, MushafLayoutPage, MushafWordTranslationMap } from "@/mushaf";
import { navigateWithOfflineSupport, prefetchWithOfflineSupport } from "@/lib/pwa/navigation";
import type { ReadAudioTrack } from "../domain/audio/pageAudioTracks";
import type { ReadMode } from "../domain/readMode";
import { useReadMode } from "../domain/useReadMode";
import { ReadPageCanvas } from "./ReadPageCanvas";
import { useReadAudio } from "./ReadAudioProvider";
import { useReadHifzQueue } from "./useReadHifzQueue";
import { useReadPageHydration } from "./useReadPageHydration";

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
  hifzExercise?: HifzExerciseFlow | null;
  hifzNavigationSearch?: string | null;
  personalizationPageNumber?: number | null;
}

const HIFZ_REVEAL_STORAGE_KEY = "miftah:read:hifz-reveal-by-thirds";
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
  hifzExercise = null,
  hifzNavigationSearch = null,
  personalizationPageNumber = null,
}: ReadPageWorkspaceProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const audio = useReadAudio();
  const { mode, setMode } = useReadMode();
  const appliedInitialModeRef = useRef(false);
  const audioEnabled = mode === "read" || mode === "hifz";
  const audioDiscovered = useSyncExternalStore(subscribeAudioDiscovery, getAudioDiscoverySnapshot, () => true);
  const [showJumpControls, setShowJumpControls] = useState(false);
  const [tasmiRevealedLines, setTasmiRevealedLines] = useState(0);
  const [memorizeHideMushaf, setMemorizeHideMushaf] = useState(false);
  const [memorizeViewportInset, setMemorizeViewportInset] = useState(0);
  const [memorizeChunkAyahKeys, setMemorizeChunkAyahKeys] = useState<string[] | null>(null);
  const [sessionStartTime] = useState(() => Date.now());
  const [sessionPagesCompleted, setSessionPagesCompleted] = useState(0);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [sessionElapsedMs, setSessionElapsedMs] = useState(0);
  const totalLineCount = hifzFlow === "review"
    ? Math.max(layout.lines.filter((line) => line.type === "text").length, 1)
    : 15;
  const tasmiAllRevealed = hifzFlow === "review" && tasmiRevealedLines >= totalLineCount;
  const hifzQueueIndex = useMemo(() => {
    const parsed = Number.parseInt(searchParams.get("qi") ?? "", 10);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
  }, [searchParams]);
  const queue = useReadHifzQueue({ flow: hifzFlow, pageNumber, queueIndex: hifzQueueIndex });
  const hydration = useReadPageHydration({
    audioEnabled,
    audioTracks,
    ayahDetails,
    exercise: hifzExercise,
    flow: hifzFlow,
    initialMemorizedAyahKeys: memorizedAyahKeys,
    layout,
    memorizeChunkAyahKeys,
    pageNumber,
    personalizationPageNumber,
    readingAyahIds,
    setAudioVisible: audio.setAudioVisible,
    setPlayableAyahKeys: audio.setPlayableAyahKeys,
    syncAudioTracks: audio.syncAudioTracks,
  });
  const [hifzRevealByThirdsEnabled, setHifzRevealByThirdsEnabled] = useState(() => {
    if (forceHifzRevealByThirds) return true;
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(HIFZ_REVEAL_STORAGE_KEY) === "1";
  });

  useEffect(() => {
    window.localStorage.setItem(HIFZ_REVEAL_STORAGE_KEY, hifzRevealByThirdsEnabled ? "1" : "0");
  }, [hifzRevealByThirdsEnabled]);
  useEffect(() => {
    if (appliedInitialModeRef.current) return;
    setMode(initialReadMode ?? "read");
    appliedInitialModeRef.current = true;
  }, [initialReadMode, setMode]);
  useEffect(() => {
    if (hifzFlow !== null) {
      if (queue.previousPage) prefetchWithOfflineSupport(router, buildQueuePageHref(hifzFlow, queue.previousPage.pageNumber, queue.previousPage.index));
      if (queue.nextPage) prefetchWithOfflineSupport(router, buildQueuePageHref(hifzFlow, queue.nextPage.pageNumber, queue.nextPage.index));
      return;
    }
    if (!hifzNavigationSearch) return;
    if (pageNumber > 1) prefetchWithOfflineSupport(router, `/read/${pageNumber - 1}?${hifzNavigationSearch}`);
    if (pageNumber < 604) prefetchWithOfflineSupport(router, `/read/${pageNumber + 1}?${hifzNavigationSearch}`);
  }, [hifzFlow, hifzNavigationSearch, pageNumber, queue.nextPage, queue.previousPage, router]);

  const previousPageHref = useMemo(() => {
    if (hifzFlow !== null) return queue.previousPage ? buildQueuePageHref(hifzFlow, queue.previousPage.pageNumber, queue.previousPage.index) : null;
    if (pageNumber <= 1) return null;
    return hifzNavigationSearch ? `/read/${pageNumber - 1}?${hifzNavigationSearch}` : `/read/${pageNumber - 1}`;
  }, [hifzFlow, hifzNavigationSearch, pageNumber, queue.previousPage]);
  const nextPageHref = useMemo(() => {
    if (hifzFlow !== null) return queue.nextPage ? buildQueuePageHref(hifzFlow, queue.nextPage.pageNumber, queue.nextPage.index) : null;
    if (pageNumber >= 604) return null;
    return hifzNavigationSearch ? `/read/${pageNumber + 1}?${hifzNavigationSearch}` : `/read/${pageNumber + 1}`;
  }, [hifzFlow, hifzNavigationSearch, pageNumber, queue.nextPage]);

  const markAudioDiscovered = useCallback(() => {
    if (audioDiscovered) return;
    window.localStorage.setItem(AUDIO_DISCOVERY_STORAGE_KEY, "1");
    window.dispatchEvent(new Event("miftah:audio-discovery"));
  }, [audioDiscovered]);
  const handleToggleAudio = useCallback(() => {
    if (!audioEnabled) return;
    audio.toggleAudioVisibility();
    markAudioDiscovered();
  }, [audio, audioEnabled, markAudioDiscovered]);
  const handleCanvasTap = useCallback(() => {
    if (!audioEnabled) return;
    audio.toggleAudioVisibility();
    markAudioDiscovered();
  }, [audio, audioEnabled, markAudioDiscovered]);
  const handleAyahAudioTap = useCallback((ayahKey: string) => {
    if (!audioEnabled) return;
    audio.startAudioFromAyah(ayahKey);
    markAudioDiscovered();
  }, [audio, audioEnabled, markAudioDiscovered]);
  const handleChunkListen = useCallback(() => {
    audio.setAudioVisible(true);
    audio.restartAudioPlayback();
    audio.requestAudioAutoplay();
    markAudioDiscovered();
  }, [audio, markAudioDiscovered]);

  return (
    <ReadPageCanvas
      activePlaybackAyahKey={audio.activePlaybackAyahKey}
      alignData={hydration.alignData}
      audioDiscovered={audioDiscovered}
      audioEnabled={audioEnabled}
      audioFinishedSignal={audio.allTracksEndedSignal}
      ayahDetails={ayahDetails}
      contentBottomPadding={hifzFlow === "memorize" && memorizeViewportInset > 0 ? memorizeViewportInset + 16 : undefined}
      currentJuzNumber={currentJuzNumber}
      currentSurahId={currentSurahId}
      exercise={hifzExercise}
      flow={hifzFlow}
      hifzRevealByThirdsEnabled={hifzRevealByThirdsEnabled}
      isAudioVisible={audio.isAudioVisible}
      isRecovering={queue.isRecovering}
      layout={layout}
      memorizeHideMushaf={memorizeHideMushaf}
      mushafHeader={mushafHeader}
      nextPageHref={nextPageHref}
      pageManifest={hydration.pageManifest}
      pageNumber={pageNumber}
      previousPageHref={previousPageHref}
      queueIndex={hifzQueueIndex ?? 0}
      queueRecoveryError={queue.recoveryError}
      queueTotalPages={queue.totalPages}
      readingAyahIds={readingAyahIds}
      resolvedMemorizedAyahKeys={hydration.resolvedMemorizedAyahKeys}
      sessionComplete={sessionComplete}
      sessionElapsedMs={sessionElapsedMs}
      sessionPagesCompleted={sessionPagesCompleted}
      sessionStartTime={sessionStartTime}
      shouldTrackExposure={hydration.shouldTrackExposure}
      showJumpControls={showJumpControls}
      showTasmiOverlay={hifzFlow === "review" && !tasmiAllRevealed}
      tasmiAllRevealed={tasmiAllRevealed}
      tasmiRevealedLines={tasmiRevealedLines}
      themeSurahId={themeSurahId}
      totalLineCount={totalLineCount}
      useLightweightViewer={hifzFlow === null && initialReadMode !== "hifz"}
      wordTranslations={wordTranslations}
      setHifzRevealByThirdsEnabled={setHifzRevealByThirdsEnabled}
      setMemorizeChunkAyahKeys={setMemorizeChunkAyahKeys}
      setMemorizeHideMushaf={setMemorizeHideMushaf}
      setMemorizeViewportInset={setMemorizeViewportInset}
      setPlayableAyahKeys={audio.setPlayableAyahKeys}
      setSessionComplete={setSessionComplete}
      setSessionElapsedMs={setSessionElapsedMs}
      setSessionPagesCompleted={setSessionPagesCompleted}
      setShowJumpControls={setShowJumpControls}
      setTasmiRevealedLines={setTasmiRevealedLines}
      onAudioDiscovered={markAudioDiscovered}
      onAyahAudioTap={handleAyahAudioTap}
      onCanvasTap={handleCanvasTap}
      onChunkListen={handleChunkListen}
      onChunkPause={audio.pauseAudioPlayback}
      onExerciseExit={() => navigateWithOfflineSupport(router, `/read/${pageNumber}`)}
      onNavigateNextPage={() => nextPageHref && navigateWithOfflineSupport(router, nextPageHref)}
      onNavigatePreviousPage={() => previousPageHref && navigateWithOfflineSupport(router, previousPageHref)}
      onReadyChange={hydration.setIsImageReady}
      onTasmiTap={() => setTasmiRevealedLines((lines) => Math.min(lines + 1, totalLineCount))}
      onToggleAudio={handleToggleAudio}
    />
  );
}
