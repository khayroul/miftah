import { useEffect, useRef, type Dispatch, type RefObject, type SetStateAction } from "react";
import type { ReadAudioTrack } from "../../domain/audio/pageAudioTracks";
import { resolveReadAudioPageStartFromAyah } from "../../domain/audio/readAudioStart";
import type { RangePreset, ReadAudioLoopState } from "./readAudioDockTypes";

interface UseReadAudioExternalRequestsOptions {
  audioRef: RefObject<HTMLAudioElement | null>;
  shouldAutoplayRef: RefObject<boolean>;
  loopStateRef: RefObject<ReadAudioLoopState>;
  autoplayRequestKey: number;
  pauseRequestKey: number;
  restartRequestKey: number;
  startFromAyahKey: string | null;
  startFromAyahRequestKey: number;
  canPlay: boolean;
  normalizedRangeStart: number;
  safeIndex: number;
  tracks: ReadAudioTrack[];
  setCurrentIndex: Dispatch<SetStateAction<number>>;
  setExpandedTracks: Dispatch<SetStateAction<ReadAudioTrack[] | null>>;
  setIsPlaying: Dispatch<SetStateAction<boolean>>;
  setRangeEndIndex: Dispatch<SetStateAction<number>>;
  setRangePreset: Dispatch<SetStateAction<RangePreset>>;
  setRangeStartIndex: Dispatch<SetStateAction<number>>;
  setRepeatEachStep: Dispatch<SetStateAction<number>>;
  setRepeatSetStep: Dispatch<SetStateAction<number>>;
}

export function useReadAudioExternalRequests(options: UseReadAudioExternalRequestsOptions) {
  const processedAutoplayRef = useRef(0);
  const processedRestartRef = useRef(0);
  const processedStartFromAyahRef = useRef(0);
  const {
    audioRef, shouldAutoplayRef, loopStateRef, autoplayRequestKey,
    pauseRequestKey, restartRequestKey, startFromAyahKey,
    startFromAyahRequestKey, canPlay, normalizedRangeStart, safeIndex, tracks,
    setCurrentIndex, setExpandedTracks, setIsPlaying, setRangeEndIndex,
    setRangePreset, setRangeStartIndex, setRepeatEachStep, setRepeatSetStep,
  } = options;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !canPlay || autoplayRequestKey === 0 || processedAutoplayRef.current >= autoplayRequestKey) return;
    processedAutoplayRef.current = autoplayRequestKey;
    shouldAutoplayRef.current = false;
    audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
  }, [audioRef, autoplayRequestKey, canPlay, setIsPlaying, shouldAutoplayRef]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio && pauseRequestKey !== 0) audio.pause();
  }, [audioRef, pauseRequestKey]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !canPlay || restartRequestKey === 0 || processedRestartRef.current >= restartRequestKey) return;
    processedRestartRef.current = restartRequestKey;
    const restartIndex = normalizedRangeStart;
    if (safeIndex !== restartIndex) {
      const frame = window.requestAnimationFrame(() => {
        shouldAutoplayRef.current = true;
        setCurrentIndex(restartIndex);
      });
      return () => window.cancelAnimationFrame(frame);
    }
    audio.currentTime = 0;
    audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
  }, [audioRef, canPlay, normalizedRangeStart, restartRequestKey, safeIndex, setCurrentIndex, setIsPlaying, shouldAutoplayRef]);

  useEffect(() => {
    if (startFromAyahRequestKey === 0 || !startFromAyahKey || tracks.length === 0 || processedStartFromAyahRef.current >= startFromAyahRequestKey) return;
    const capturedRequestKey = startFromAyahRequestKey;
    const frame = window.requestAnimationFrame(() => {
      processedStartFromAyahRef.current = capturedRequestKey;
      const selection = resolveReadAudioPageStartFromAyah(tracks, startFromAyahKey);
      if (!selection) return;
      setRangePreset("page");
      setExpandedTracks(null);
      setRangeStartIndex(selection.rangeStartIndex);
      setRangeEndIndex(selection.rangeEndIndex);
      setRepeatEachStep(0);
      setRepeatSetStep(0);
      const audio = audioRef.current;
      const state = loopStateRef.current;
      const currentKey = tracks[state.safeIndex]?.key;
      const isSameTrack = state.safeIndex === selection.currentIndex && currentKey === startFromAyahKey;
      if (isSameTrack && audio) {
        audio.currentTime = 0;
        audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
        return;
      }
      shouldAutoplayRef.current = true;
      setCurrentIndex(selection.currentIndex);
      setIsPlaying(false);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [audioRef, loopStateRef, setCurrentIndex, setExpandedTracks, setIsPlaying, setRangeEndIndex, setRangePreset, setRangeStartIndex, setRepeatEachStep, setRepeatSetStep, shouldAutoplayRef, startFromAyahKey, startFromAyahRequestKey, tracks]);
}
