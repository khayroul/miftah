"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReadAudioTrack } from "../domain/audio/pageAudioTracks";
import {
  fetchJuzAudioTracks,
  fetchSurahAudioTracks,
} from "@/data/repositories/read/audio";
import { trackReadAudioTelemetry } from "../domain/audio/readAudioTelemetry";
import { ReadAudioBar } from "./audio/ReadAudioBar";
import { ReadAudioPanel } from "./audio/ReadAudioPanel";
import {
  clamp,
  formatTrackLabel,
  type RangePreset,
  type ReadAudioDockProps,
  type RepeatOption,
} from "./audio/readAudioDockTypes";
import { useReadAudioDockActions } from "./audio/useReadAudioDockActions";
import { useReadAudioExternalRequests } from "./audio/useReadAudioExternalRequests";

export function ReadAudioDock({
  autoplayRequestKey = 0,
  pauseRequestKey = 0,
  restartRequestKey = 0,
  startFromAyahKey = null,
  startFromAyahRequestKey = 0,
  tracks: sourceTracks,
  playableAyahKeys = null,
  visible,
  onPlaybackAyahChange,
  onPanelOpenChange,
  onAllTracksEnded,
}: ReadAudioDockProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const shouldAutoplayRef = useRef(false);
  const wasPanelVisibleRef = useRef(false);
  const loopStateRef = useRef({
    safeIndex: 0,
    normalizedRangeStart: 0,
    normalizedRangeEnd: 0,
    repeatEachVerse: 1 as RepeatOption,
    repeatSet: 1 as RepeatOption,
    repeatEachStep: 0,
    repeatSetStep: 0,
  });
  const [panelOpen, setPanelOpen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [rangePreset, setRangePreset] = useState<RangePreset>("page");
  const [rangeStartIndex, setRangeStartIndex] = useState(0);
  const [rangeEndIndex, setRangeEndIndex] = useState(() =>
    Math.max(sourceTracks.length - 1, 0),
  );
  const [repeatEachVerse, setRepeatEachVerse] = useState<RepeatOption>(1);
  const [repeatSet, setRepeatSet] = useState<RepeatOption>(1);
  const [repeatEachStep, setRepeatEachStep] = useState(0);
  const [repeatSetStep, setRepeatSetStep] = useState(0);
  const [playbackRate, setPlaybackRate] = useState<number>(() => {
    if (typeof window === "undefined") return 1;
    const stored = localStorage.getItem("miftah:audio-speed");
    if (!stored) return 1;
    const parsed = Number.parseFloat(stored);
    return [0.75, 1, 1.25, 1.5].includes(parsed) ? parsed : 1;
  });
  const [expandedTracks, setExpandedTracks] = useState<ReadAudioTrack[] | null>(
    null,
  );
  const [expandedLoading, setExpandedLoading] = useState(false);
  const expandedFetchRef = useRef(0);

  const fetchExpandedTracks = useCallback(
    async (preset: RangePreset, anchorTrack: ReadAudioTrack | null) => {
      if (preset === "page" || !anchorTrack) {
        setExpandedTracks(null);
        return;
      }
      const fetchId = ++expandedFetchRef.current;
      setExpandedLoading(true);
      try {
        const fetched =
          preset === "surah"
            ? await fetchSurahAudioTracks(anchorTrack.surahId)
            : await fetchJuzAudioTracks(anchorTrack.juzNumber);
        if (expandedFetchRef.current !== fetchId) return;
        setExpandedTracks(fetched.length > 0 ? fetched : null);
      } catch {
        if (expandedFetchRef.current !== fetchId) return;
        setExpandedTracks(null);
      } finally {
        if (expandedFetchRef.current === fetchId) {
          setExpandedLoading(false);
        }
      }
    },
    [],
  );

  const activeTracks = expandedTracks ?? sourceTracks;
  const playableAyahKeySet = useMemo(() => {
    if (!playableAyahKeys || playableAyahKeys.length === 0) {
      return null;
    }
    return new Set(playableAyahKeys);
  }, [playableAyahKeys]);
  const tracks = useMemo(() => {
    if (!playableAyahKeySet) {
      return activeTracks;
    }
    return activeTracks.filter((track) => playableAyahKeySet.has(track.key));
  }, [playableAyahKeySet, activeTracks]);
  const hasPlaybackCap =
    playableAyahKeySet !== null && tracks.length < activeTracks.length;

  const maxIndex = Math.max(tracks.length - 1, 0);
  const clampedRangeStart = clamp(rangeStartIndex, 0, maxIndex);
  const clampedRangeEnd = hasPlaybackCap
    ? maxIndex
    : clamp(rangeEndIndex, 0, maxIndex);
  const normalizedRangeStart = Math.min(clampedRangeStart, clampedRangeEnd);
  const normalizedRangeEnd = Math.max(clampedRangeStart, clampedRangeEnd);
  const safeIndex = tracks.length
    ? clamp(currentIndex, normalizedRangeStart, normalizedRangeEnd)
    : 0;
  const currentTrack = tracks[safeIndex] ?? null;
  const canPlay = currentTrack !== null;
  const panelVisible = panelOpen && visible !== false && tracks.length > 0;

  // Keep loop state ref in sync so handleAudioEnded always reads the latest values
  loopStateRef.current = {
    safeIndex,
    normalizedRangeStart,
    normalizedRangeEnd,
    repeatEachVerse,
    repeatSet,
    repeatEachStep,
    repeatSetStep,
  };

  useEffect(() => {
    if (!onPlaybackAyahChange) {
      return;
    }
    if (!isPlaying || !currentTrack) {
      onPlaybackAyahChange(null);
      return;
    }
    onPlaybackAyahChange(currentTrack.key);
  }, [currentTrack, isPlaying, onPlaybackAyahChange]);

  useEffect(() => {
    return () => {
      onPlaybackAyahChange?.(null);
    };
  }, [onPlaybackAyahChange]);

  useEffect(() => {
    if (tracks.length > 0) {
      return;
    }
    const audio = audioRef.current;
    audio?.pause();
  }, [tracks.length]);

  // When expanded tracks arrive (surah/juz fetch complete), set range to cover all tracks
  // and position the playhead at the ayah that was playing before the switch.
  const prevExpandedRef = useRef(expandedTracks);
  useEffect(() => {
    if (expandedTracks === prevExpandedRef.current) return;
    prevExpandedRef.current = expandedTracks;
    if (!expandedTracks || expandedTracks.length === 0) return;

    const lastMax = Math.max(expandedTracks.length - 1, 0);

    // For Juz preset, start from the current page's first ayah instead of the
    // beginning of the juz so playback flows from the visible page forward.
    let startIdx = 0;
    if (rangePreset === "juz" && sourceTracks.length > 0) {
      const firstPageKey = sourceTracks[0]?.key;
      if (firstPageKey) {
        const pageIdx = expandedTracks.findIndex((t) => t.key === firstPageKey);
        if (pageIdx >= 0) startIdx = pageIdx;
      }
    }

    setRangeStartIndex(startIdx);
    setRangeEndIndex(lastMax);

    // Position playhead at the previously-playing track, or at the range start
    const currentKey = currentTrack?.key;
    if (currentKey) {
      const matchIndex = expandedTracks.findIndex((t) => t.key === currentKey);
      if (matchIndex >= 0) {
        shouldAutoplayRef.current = isPlaying;
        setCurrentIndex(matchIndex);
        return;
      }
    }
    shouldAutoplayRef.current = isPlaying;
    setCurrentIndex(startIdx);
  }, [expandedTracks, currentTrack?.key, isPlaying, rangePreset, sourceTracks]);

  useEffect(() => {
    onPanelOpenChange?.(panelVisible);
  }, [onPanelOpenChange, panelVisible]);

  useEffect(() => {
    if (panelVisible && !wasPanelVisibleRef.current) {
      trackReadAudioTelemetry("read_audio_expand", {
        rangePreset,
        rangeSize: normalizedRangeEnd - normalizedRangeStart + 1,
      });
    }
    wasPanelVisibleRef.current = panelVisible;
  }, [normalizedRangeEnd, normalizedRangeStart, panelVisible, rangePreset]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    audio.load();
    audio.playbackRate = playbackRate;
    if (!shouldAutoplayRef.current) {
      return;
    }
    shouldAutoplayRef.current = false;
    audio.play().catch(() => {
      audio.pause();
    });
  }, [currentTrack?.audioUrl, playbackRate, safeIndex]);

  useReadAudioExternalRequests({
    audioRef,
    shouldAutoplayRef,
    loopStateRef,
    autoplayRequestKey,
    pauseRequestKey,
    restartRequestKey,
    startFromAyahKey,
    startFromAyahRequestKey,
    canPlay,
    normalizedRangeStart,
    safeIndex,
    tracks,
    setCurrentIndex,
    setExpandedTracks,
    setIsPlaying,
    setRangeEndIndex,
    setRangePreset,
    setRangeStartIndex,
    setRepeatEachStep,
    setRepeatSetStep,
  });

  const rangeSummary = useMemo(() => {
    const startTrack = tracks[normalizedRangeStart];
    const endTrack = tracks[normalizedRangeEnd];
    if (!startTrack || !endTrack) {
      return null;
    }
    const count = normalizedRangeEnd - normalizedRangeStart + 1;
    return `${formatTrackLabel(startTrack)} → ${formatTrackLabel(endTrack)} (${count} ayat)`;
  }, [normalizedRangeEnd, normalizedRangeStart, tracks]);

  const actions = useReadAudioDockActions({
    audioRef,
    shouldAutoplayRef,
    loopStateRef,
    sourceTracks,
    tracks,
    playableAyahKeySet,
    safeIndex,
    maxIndex,
    normalizedRangeStart,
    normalizedRangeEnd,
    rangePreset,
    isPlaying,
    canPlay,
    currentTrack,
    fetchExpandedTracks,
    setRangePreset,
    setExpandedTracks,
    setRangeStartIndex,
    setRangeEndIndex,
    setRepeatEachStep,
    setRepeatSetStep,
    setCurrentIndex,
    setIsPlaying,
    onAllTracksEnded,
  });

  return (
    <>
      {panelVisible ? (
        <div className="fixed inset-0 z-[65] bg-black/35" onClick={() => setPanelOpen(false)}>
          <section
            className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-4xl rounded-t-[24px] border border-b-0 border-stone-200 bg-white/97 shadow-[0_-16px_44px_rgba(0,0,0,0.24)] backdrop-blur dark:border-stone-700 dark:bg-stone-900/96"
            onClick={(event) => event.stopPropagation()}
          >
            <ReadAudioPanel
              tracks={tracks}
              safeIndex={safeIndex}
              rangePreset={rangePreset}
              normalizedRangeStart={normalizedRangeStart}
              normalizedRangeEnd={normalizedRangeEnd}
              expandedLoading={expandedLoading}
              rangeSummary={rangeSummary}
              hasPlaybackCap={hasPlaybackCap}
              repeatEachVerse={repeatEachVerse}
              repeatSet={repeatSet}
              playbackRate={playbackRate}
              onClose={() => setPanelOpen(false)}
              onApplyRangePreset={actions.applyRangePreset}
              onRangeEndChange={setRangeEndIndex}
              onRepeatEachVerseChange={(next) => {
                setRepeatEachVerse(next);
                setRepeatEachStep(0);
                trackReadAudioTelemetry("read_audio_repeat_change", { target: "verse", value: next });
              }}
              onRepeatSetChange={(next) => {
                setRepeatSet(next);
                setRepeatSetStep(0);
                trackReadAudioTelemetry("read_audio_repeat_change", { target: "set", value: next });
              }}
              onPlaybackRateChange={(rate) => {
                setPlaybackRate(rate);
                if (audioRef.current) audioRef.current.playbackRate = rate;
              }}
              onPreviousTrack={() => actions.goToTrack(safeIndex - 1)}
              onNextTrack={actions.handleNextTrack}
            />
          </section>
        </div>
      ) : null}
      <div
        className={`fixed inset-x-0 bottom-0 z-[70] transition-all duration-300 ${
          visible === false || panelVisible
            ? "pointer-events-none translate-y-full opacity-0"
            : "translate-y-0 opacity-100"
        }`}
      >
        <audio
          ref={audioRef}
          preload="metadata"
          src={currentTrack?.audioUrl}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={actions.handleAudioEnded}
          onError={actions.handleAudioError}
        />

        <div className="mx-auto w-full max-w-[30rem] px-2 pb-[calc(12px+env(safe-area-inset-bottom))] sm:max-w-4xl sm:px-4">
          <section className="rounded-[22px] border border-stone-200 bg-white/96 shadow-[0_14px_36px_rgba(0,0,0,0.16)] backdrop-blur dark:border-stone-700 dark:bg-stone-900/94 sm:rounded-[24px] sm:shadow-[0_16px_44px_rgba(0,0,0,0.18)]">
            <ReadAudioBar
              canPlay={canPlay}
              isPlaying={isPlaying}
              safeIndex={safeIndex}
              normalizedRangeEnd={normalizedRangeEnd}
              rangePreset={rangePreset}
              playbackRate={playbackRate}
              currentTrack={currentTrack}
              hasPlaybackCap={hasPlaybackCap}
              onTogglePlayback={() => void actions.togglePlayback()}
              onNextTrack={actions.handleNextTrack}
              onCycleRangePreset={actions.cycleRangePreset}
              onPlaybackRateChange={(rate) => {
                setPlaybackRate(rate);
                if (audioRef.current) audioRef.current.playbackRate = rate;
              }}
              onTogglePanel={() => setPanelOpen((open) => !open)}
            />
          </section>
        </div>
      </div>
    </>
  );
}
