import { useCallback, type Dispatch, type RefObject, type SetStateAction } from "react";
import type { ReadAudioTrack } from "../../domain/audio/pageAudioTracks";
import { resolveReadAudioLoopAction } from "../../domain/audio/readAudioLoop";
import { trackReadAudioTelemetry } from "../../domain/audio/readAudioTelemetry";
import {
  clamp,
  resolvePresetEndIndex,
  type RangePreset,
  type ReadAudioLoopState,
} from "./readAudioDockTypes";

interface UseReadAudioDockActionsOptions {
  audioRef: RefObject<HTMLAudioElement | null>;
  shouldAutoplayRef: RefObject<boolean>;
  loopStateRef: RefObject<ReadAudioLoopState>;
  sourceTracks: ReadAudioTrack[];
  tracks: ReadAudioTrack[];
  playableAyahKeySet: Set<string> | null;
  safeIndex: number;
  maxIndex: number;
  normalizedRangeStart: number;
  normalizedRangeEnd: number;
  rangePreset: RangePreset;
  isPlaying: boolean;
  canPlay: boolean;
  currentTrack: ReadAudioTrack | null;
  fetchExpandedTracks: (preset: RangePreset, anchor: ReadAudioTrack | null) => Promise<void>;
  setRangePreset: Dispatch<SetStateAction<RangePreset>>;
  setExpandedTracks: Dispatch<SetStateAction<ReadAudioTrack[] | null>>;
  setRangeStartIndex: Dispatch<SetStateAction<number>>;
  setRangeEndIndex: Dispatch<SetStateAction<number>>;
  setRepeatEachStep: Dispatch<SetStateAction<number>>;
  setRepeatSetStep: Dispatch<SetStateAction<number>>;
  setCurrentIndex: Dispatch<SetStateAction<number>>;
  setIsPlaying: Dispatch<SetStateAction<boolean>>;
  onAllTracksEnded?: () => void;
}

export function useReadAudioDockActions(options: UseReadAudioDockActionsOptions) {
  const {
    audioRef, shouldAutoplayRef, loopStateRef, sourceTracks, tracks,
    playableAyahKeySet, safeIndex, maxIndex, normalizedRangeStart,
    normalizedRangeEnd, rangePreset, isPlaying, canPlay, currentTrack,
    fetchExpandedTracks, setRangePreset, setExpandedTracks, setRangeStartIndex,
    setRangeEndIndex, setRepeatEachStep, setRepeatSetStep, setCurrentIndex,
    setIsPlaying, onAllTracksEnded,
  } = options;

  const applyRangePreset = (preset: RangePreset, startIndex: number) => {
    setRangePreset(preset);
    setRepeatEachStep(0);
    setRepeatSetStep(0);
    if (preset === "page") {
      setExpandedTracks(null);
      const pageTracks = playableAyahKeySet
        ? sourceTracks.filter((track) => playableAyahKeySet.has(track.key))
        : sourceTracks;
      const pageMax = Math.max(pageTracks.length - 1, 0);
      const nextStart = clamp(startIndex, 0, pageMax);
      const nextEnd = resolvePresetEndIndex(pageTracks, nextStart, preset);
      setRangeStartIndex(nextStart);
      setRangeEndIndex(clamp(nextEnd, nextStart, pageMax));
      const currentKey = tracks[safeIndex]?.key;
      if (currentKey) {
        const pageIndex = pageTracks.findIndex((track) => track.key === currentKey);
        if (pageIndex >= 0) {
          shouldAutoplayRef.current = isPlaying;
          setCurrentIndex(pageIndex);
          return;
        }
      }
      shouldAutoplayRef.current = isPlaying;
      setCurrentIndex(nextStart);
      return;
    }
    const anchorTrack = tracks[clamp(startIndex, 0, maxIndex)] ?? null;
    void fetchExpandedTracks(preset, anchorTrack);
  };

  const goToTrack = (targetIndex: number) => {
    if (targetIndex < normalizedRangeStart || targetIndex > normalizedRangeEnd) return;
    shouldAutoplayRef.current = isPlaying;
    setCurrentIndex(targetIndex);
    setRepeatEachStep(0);
  };

  const handleNextTrack = () => {
    if (safeIndex >= normalizedRangeEnd) return;
    trackReadAudioTelemetry("read_audio_next", { currentAyah: currentTrack?.key ?? null, nextIndex: safeIndex + 1 });
    goToTrack(safeIndex + 1);
  };

  const cycleRangePreset = () => {
    const presets: RangePreset[] = ["page", "surah", "juz"];
    const nextPreset = presets[(presets.indexOf(rangePreset) + 1) % presets.length] ?? "page";
    trackReadAudioTelemetry("read_audio_range_preset", { from: rangePreset, to: nextPreset, fromAyah: tracks[normalizedRangeStart]?.key ?? null });
    applyRangePreset(nextPreset, safeIndex);
  };

  const togglePlayback = async () => {
    const audio = audioRef.current;
    if (!audio || !canPlay) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
      trackReadAudioTelemetry("read_audio_drop_off", { source: "manual_pause", ayah: currentTrack?.key ?? null });
      return;
    }
    try {
      await audio.play();
      setIsPlaying(true);
    } catch {
      setIsPlaying(false);
    }
  };

  const handleAudioEnded = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const state = loopStateRef.current;
    const nextAction = resolveReadAudioLoopAction({
      currentIndex: state.safeIndex,
      rangeStartIndex: state.normalizedRangeStart,
      rangeEndIndex: state.normalizedRangeEnd,
      repeatEachVerse: state.repeatEachVerse,
      repeatSet: state.repeatSet,
      repeatEachStep: state.repeatEachStep,
      repeatSetStep: state.repeatSetStep,
    });
    setRepeatEachStep(nextAction.nextRepeatEachStep);
    setRepeatSetStep(nextAction.nextRepeatSetStep);
    if (nextAction.type === "replay-current") {
      audio.currentTime = 0;
      audio.play().catch(() => setIsPlaying(false));
      return;
    }
    if (nextAction.type === "play-index") {
      shouldAutoplayRef.current = true;
      setCurrentIndex(nextAction.nextIndex);
      return;
    }
    setIsPlaying(false);
    onAllTracksEnded?.();
  }, [audioRef, loopStateRef, onAllTracksEnded, setCurrentIndex, setIsPlaying, setRepeatEachStep, setRepeatSetStep, shouldAutoplayRef]);

  const handleAudioError = useCallback(() => {
    const state = loopStateRef.current;
    if (state.safeIndex < state.normalizedRangeEnd) {
      shouldAutoplayRef.current = true;
      setRepeatEachStep(0);
      setCurrentIndex(state.safeIndex + 1);
      return;
    }
    const canRepeatSet = state.repeatSet === -1 || state.repeatSetStep < state.repeatSet - 1;
    if (canRepeatSet && state.normalizedRangeStart < state.normalizedRangeEnd) {
      shouldAutoplayRef.current = true;
      setRepeatEachStep(0);
      setRepeatSetStep(state.repeatSet === -1 ? state.repeatSetStep : state.repeatSetStep + 1);
      setCurrentIndex(state.normalizedRangeStart);
      return;
    }
    setRepeatEachStep(0);
    setRepeatSetStep(0);
    setIsPlaying(false);
    onAllTracksEnded?.();
  }, [loopStateRef, onAllTracksEnded, setCurrentIndex, setIsPlaying, setRepeatEachStep, setRepeatSetStep, shouldAutoplayRef]);

  return { applyRangePreset, cycleRangePreset, goToTrack, handleAudioEnded, handleAudioError, handleNextTrack, togglePlayback };
}
