"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  buildQueuePageHref,
  getItemsForPage,
  loadQueue,
  type HifzExerciseFlow,
  type HifzFlowType,
} from "@/features/hifz/read-runtime";
import type { HifzPracticeViewMode } from "@/features/hifz";
import type { MushafAyahDetail, MushafLayoutPage, MushafWordTranslationMap } from "@/mushaf";
import { navigateWithOfflineSupport, prefetchWithOfflineSupport } from "@/shared/pwa/navigation";
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
  hifzFreePractice?: boolean;
  hifzExercise?: HifzExerciseFlow | null;
  hifzNavigationSearch?: string | null;
  initialHifzPracticeView?: HifzPracticeViewMode | null;
  personalizationPageNumber?: number | null;
}

const HIFZ_REVEAL_STORAGE_KEY = "miftah:read:hifz-reveal-by-thirds";
const AUDIO_DISCOVERY_STORAGE_KEY = "miftah:audio:discovered";
const HIFZ_PRACTICE_VIEW_STORAGE_KEY = "miftah:hifz:practice-view:v1";

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
  hifzFreePractice = false,
  hifzExercise = null,
  hifzNavigationSearch = null,
  initialHifzPracticeView = null,
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
  const [hifzPracticeView, setHifzPracticeView] = useState<HifzPracticeViewMode>(
    initialHifzPracticeView ?? (hifzFlow === "review" ? "mushaf" : "ayah"),
  );
  const [freePracticeRevealed, setFreePracticeRevealed] = useState(false);
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
  const freePracticePassage = useMemo(() => {
    const passageParams = new URLSearchParams(hifzNavigationSearch ?? "");
    const surah = Number.parseInt(passageParams.get("surah") ?? "", 10);
    const startAyah = Number.parseInt(passageParams.get("startAyah") ?? "", 10);
    const endAyah = Number.parseInt(passageParams.get("endAyah") ?? "", 10);
    const startPage = Number.parseInt(passageParams.get("startPage") ?? "", 10);
    const endPage = Number.parseInt(passageParams.get("endPage") ?? "", 10);
    const isValid =
      Number.isInteger(surah) && surah >= 1 && surah <= 114 &&
      Number.isInteger(startAyah) && startAyah >= 1 && startAyah <= 286 &&
      Number.isInteger(endAyah) && endAyah >= startAyah && endAyah <= 286 &&
      Number.isInteger(startPage) && startPage >= 1 && startPage <= 604 &&
      Number.isInteger(endPage) && endPage >= startPage && endPage <= 604;

    if (!isValid) return null;

    return {
      ayahKeys: Array.from(
        { length: endAyah - startAyah + 1 },
        (_, index) => `${surah}:${startAyah + index}`,
      ),
      endPage,
      startPage,
    };
  }, [hifzNavigationSearch]);
  const queue = useReadHifzQueue({ flow: hifzFlow, pageNumber, queueIndex: hifzQueueIndex });
  const reviewSessionQueue = hifzFlow === "review" ? loadQueue("review") : null;
  const hifzTargetAyahKeys = hifzFlow === "memorize"
    ? (memorizeChunkAyahKeys ?? [])
    : reviewSessionQueue
      ? getItemsForPage(reviewSessionQueue, pageNumber).map((item) => item.ayahKey)
      : hifzFreePractice
        ? (freePracticePassage?.ayahKeys ?? [])
        : [];
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
    if (initialHifzPracticeView) return;
    try {
      const saved = window.localStorage.getItem(HIFZ_PRACTICE_VIEW_STORAGE_KEY);
      if (saved === "ayah" || saved === "mushaf") {
        const timer = window.setTimeout(() => setHifzPracticeView(saved), 0);
        return () => window.clearTimeout(timer);
      }
    } catch {
      // Storage may be unavailable in private browsing; keep the flow default.
    }
  }, [initialHifzPracticeView]);
  useEffect(() => {
    if (!hifzFreePractice || !freePracticePassage) return;
    audio.setPlayableAyahKeys(freePracticePassage.ayahKeys);
  }, [audio, freePracticePassage, hifzFreePractice]);
  const handleHifzPracticeViewChange = useCallback((nextView: HifzPracticeViewMode) => {
    setHifzPracticeView(nextView);
    try {
      window.localStorage.setItem(HIFZ_PRACTICE_VIEW_STORAGE_KEY, nextView);
    } catch {
      // The view still changes for this session when persistence is unavailable.
    }
  }, []);
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
    const minPage = freePracticePassage?.startPage ?? 1;
    const maxPage = freePracticePassage?.endPage ?? 604;
    if (pageNumber > minPage) prefetchWithOfflineSupport(router, `/read/${pageNumber - 1}?${hifzNavigationSearch}`);
    if (pageNumber < maxPage) prefetchWithOfflineSupport(router, `/read/${pageNumber + 1}?${hifzNavigationSearch}`);
  }, [freePracticePassage?.endPage, freePracticePassage?.startPage, hifzFlow, hifzNavigationSearch, pageNumber, queue.nextPage, queue.previousPage, router]);

  const previousPageHref = useMemo(() => {
    if (hifzFlow !== null) return queue.previousPage ? buildQueuePageHref(hifzFlow, queue.previousPage.pageNumber, queue.previousPage.index) : null;
    const minPage = freePracticePassage?.startPage ?? 1;
    if (pageNumber <= minPage) return null;
    return hifzNavigationSearch ? `/read/${pageNumber - 1}?${hifzNavigationSearch}` : `/read/${pageNumber - 1}`;
  }, [freePracticePassage?.startPage, hifzFlow, hifzNavigationSearch, pageNumber, queue.previousPage]);
  const nextPageHref = useMemo(() => {
    if (hifzFlow !== null) return queue.nextPage ? buildQueuePageHref(hifzFlow, queue.nextPage.pageNumber, queue.nextPage.index) : null;
    const maxPage = freePracticePassage?.endPage ?? 604;
    if (pageNumber >= maxPage) return null;
    return hifzNavigationSearch ? `/read/${pageNumber + 1}?${hifzNavigationSearch}` : `/read/${pageNumber + 1}`;
  }, [freePracticePassage?.endPage, hifzFlow, hifzNavigationSearch, pageNumber, queue.nextPage]);

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
      hifzPracticeView={hifzPracticeView}
      hifzFreePractice={hifzFreePractice}
      freePracticeRevealed={freePracticeRevealed}
      hifzTargetAyahKeys={hifzTargetAyahKeys}
      isAudioVisible={audio.isAudioVisible}
      isRecovering={queue.isRecovering}
      layout={layout}
      memorizeHideMushaf={memorizeHideMushaf}
      mode={mode}
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
      setFreePracticeRevealed={setFreePracticeRevealed}
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
      onHifzPracticeViewChange={handleHifzPracticeViewChange}
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
