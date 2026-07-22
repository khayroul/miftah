"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { ReadAudioTrack } from "../domain/audio/pageAudioTracks";
import { PageAudioRangeSettings } from "./PageAudioRangeSettings";

export type PageAudioTrack = ReadAudioTrack;

interface PageAudioControlsProps {
  tracks: PageAudioTrack[];
  onPlaybackAyahChange?: (ayahKey: string | null) => void;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function PageAudioControls({
  tracks,
  onPlaybackAyahChange,
}: PageAudioControlsProps) {
  const t = useTranslations("read.toolsAudio");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const shouldAutoplayRef = useRef(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState<number>(1);
  const [defaultRepeatCount, setDefaultRepeatCount] = useState<number>(1);
  const [repeatByTrack, setRepeatByTrack] = useState<Record<string, number>>({});
  const [repeatStep, setRepeatStep] = useState(0);
  const [rangeStartIndex, setRangeStartIndex] = useState(0);
  const [rangeEndIndex, setRangeEndIndex] = useState(0);
  const [loopRange, setLoopRange] = useState(false);

  const maxIndex = Math.max(tracks.length - 1, 0);
  const clampedRangeStart = clamp(rangeStartIndex, 0, maxIndex);
  const clampedRangeEnd = clamp(rangeEndIndex, 0, maxIndex);
  const normalizedRangeStart = Math.min(clampedRangeStart, clampedRangeEnd);
  const normalizedRangeEnd = Math.max(clampedRangeStart, clampedRangeEnd);
  const safeIndex =
    tracks.length > 0
      ? clamp(
          clamp(currentIndex, 0, maxIndex),
          normalizedRangeStart,
          normalizedRangeEnd,
        )
      : 0;
  const currentTrack = tracks[safeIndex] ?? null;

  const tracksInRange = useMemo(() => {
    if (tracks.length === 0) {
      return [];
    }
    return tracks.slice(normalizedRangeStart, normalizedRangeEnd + 1);
  }, [normalizedRangeEnd, normalizedRangeStart, tracks]);

  const currentRepeatCount =
    currentTrack ? repeatByTrack[currentTrack.key] ?? defaultRepeatCount : defaultRepeatCount;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    audio.playbackRate = speed;
  }, [speed]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    audio.load();

    if (!shouldAutoplayRef.current) {
      return;
    }

    shouldAutoplayRef.current = false;
    audio.play().catch(() => {
      audio.pause();
    });
  }, [currentTrack?.audioUrl, safeIndex]);

  useEffect(() => {
    if (!onPlaybackAyahChange) {
      return;
    }

    const ayahKey = isPlaying ? currentTrack?.key ?? null : null;
    onPlaybackAyahChange(ayahKey);
  }, [currentTrack?.key, isPlaying, onPlaybackAyahChange]);

  useEffect(() => {
    if (!onPlaybackAyahChange) {
      return;
    }

    return () => {
      onPlaybackAyahChange(null);
    };
  }, [onPlaybackAyahChange]);

  const canPlayAudio = tracks.length > 0 && Boolean(currentTrack);
  const canPrev = safeIndex > normalizedRangeStart;
  const canNext = safeIndex < normalizedRangeEnd;
  const repeatsRemaining =
    currentRepeatCount === -1 ? 0 : Math.max(currentRepeatCount - 1 - repeatStep, 0);

  const repeatStatus = useMemo(() => {
    if (currentRepeatCount === -1) {
      return t("repeatUnlimited");
    }

    return repeatsRemaining > 0
      ? t("repeatsRemaining", { count: repeatsRemaining })
      : t("noRepeatsPending");
  }, [currentRepeatCount, repeatsRemaining, t]);

  const rangeStatus = useMemo(() => {
    const startTrack = tracks[normalizedRangeStart];
    const endTrack = tracks[normalizedRangeEnd];
    if (!startTrack || !endTrack) {
      return null;
    }
    return t("rangeStatusFormat", {
      start: startTrack.label,
      end: endTrack.label,
      count: tracksInRange.length,
    });
  }, [normalizedRangeEnd, normalizedRangeStart, t, tracks, tracksInRange.length]);

  if (!canPlayAudio || !currentTrack) {
    return (
      <section className="rounded-2xl border border-stone-300 bg-white px-3 py-3 shadow-sm sm:px-4 dark:border-stone-600 dark:bg-stone-900">
        <p className="text-xs font-medium uppercase tracking-wide text-stone-500 dark:text-stone-400">
          {t("audioLabel")}
        </p>
        <p className="mt-2 text-sm text-stone-600 dark:text-stone-300">
          {t("noAudioUrl")}
        </p>
      </section>
    );
  }

  const togglePlayback = async () => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
      return;
    }

    try {
      await audio.play();
      setIsPlaying(true);
    } catch {
      setIsPlaying(false);
    }
  };

  const goToTrack = (targetIndex: number) => {
    if (
      targetIndex < normalizedRangeStart ||
      targetIndex > normalizedRangeEnd
    ) {
      return;
    }

    shouldAutoplayRef.current = isPlaying;
    setRepeatStep(0);
    setCurrentIndex(targetIndex);
  };

  const updateRangeStart = (targetIndex: number) => {
    const nextStart = clamp(targetIndex, 0, maxIndex);
    const nextEnd = Math.max(clampedRangeEnd, nextStart);
    setRangeStartIndex(nextStart);
    setRangeEndIndex(nextEnd);

    if (safeIndex < nextStart || safeIndex > nextEnd) {
      shouldAutoplayRef.current = isPlaying;
      setRepeatStep(0);
      setCurrentIndex(nextStart);
    }
  };

  const updateRangeEnd = (targetIndex: number) => {
    const nextEnd = clamp(targetIndex, 0, maxIndex);
    const nextStart = Math.min(clampedRangeStart, nextEnd);
    setRangeStartIndex(nextStart);
    setRangeEndIndex(nextEnd);

    if (safeIndex < nextStart || safeIndex > nextEnd) {
      shouldAutoplayRef.current = isPlaying;
      setRepeatStep(0);
      setCurrentIndex(nextEnd);
    }
  };

  const setTrackRepeatCount = (trackKey: string, value: number) => {
    setRepeatByTrack((prev) => ({
      ...prev,
      [trackKey]: value,
    }));
    if (currentTrack.key === trackKey) {
      setRepeatStep(0);
    }
  };

  const resetRangeRepeatOverrides = () => {
    setRepeatByTrack((prev) => {
      const next = { ...prev };
      for (const track of tracksInRange) {
        delete next[track.key];
      }
      return next;
    });
    setRepeatStep(0);
  };

  return (
    <section className="rounded-2xl border border-stone-300 bg-white px-3 py-3 shadow-sm sm:px-4 dark:border-stone-600 dark:bg-stone-900">
      <p className="text-xs font-medium uppercase tracking-wide text-stone-500 dark:text-stone-400">
        {t("audioLabel")}
      </p>

      <audio
        ref={audioRef}
        preload="metadata"
        src={currentTrack.audioUrl}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          const audio = audioRef.current;
          if (!audio) {
            return;
          }

          const repeatTarget = repeatByTrack[currentTrack.key] ?? defaultRepeatCount;
          if (repeatTarget === -1) {
            audio.currentTime = 0;
            audio.play().catch(() => setIsPlaying(false));
            return;
          }

          if (repeatStep < repeatTarget - 1) {
            setRepeatStep((step) => step + 1);
            audio.currentTime = 0;
            audio.play().catch(() => setIsPlaying(false));
            return;
          }

          if (canNext) {
            shouldAutoplayRef.current = true;
            setRepeatStep(0);
            setCurrentIndex((index) => Math.min(index + 1, tracks.length - 1));
            return;
          }

          if (loopRange) {
            shouldAutoplayRef.current = true;
            setRepeatStep(0);
            setCurrentIndex(normalizedRangeStart);
            return;
          }

          setIsPlaying(false);
        }}
      />

      <div className="mt-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 dark:border-stone-700 dark:bg-stone-800/50">
        <p className="text-sm font-medium text-stone-900 dark:text-stone-100">{t("nowPlaying", { label: currentTrack.label })}</p>
        <p className="mt-1 text-xs text-stone-600 line-clamp-2 dark:text-stone-300">
          {currentTrack.bm ?? t("noBmTranslation")}
        </p>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => goToTrack(safeIndex - 1)}
          disabled={!canPrev}
          className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm text-stone-700 transition enabled:hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-stone-600 dark:text-stone-200 dark:enabled:hover:bg-stone-800"
        >
          {t("prevAyah")}
        </button>
        <button
          type="button"
          onClick={togglePlayback}
          className="rounded-lg bg-stone-900 px-3 py-1.5 text-sm text-stone-50 transition hover:bg-stone-700 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-300"
        >
          {isPlaying ? t("pauseLabel") : t("playLabel")}
        </button>
        <button
          type="button"
          onClick={() => goToTrack(safeIndex + 1)}
          disabled={!canNext}
          className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm text-stone-700 transition enabled:hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-stone-600 dark:text-stone-200 dark:enabled:hover:bg-stone-800"
        >
          {t("nextAyah")}
        </button>
      </div>

      <PageAudioRangeSettings
        defaultRepeatCount={defaultRepeatCount}
        loopRange={loopRange}
        normalizedRangeEnd={normalizedRangeEnd}
        normalizedRangeStart={normalizedRangeStart}
        rangeStatus={rangeStatus}
        repeatByTrack={repeatByTrack}
        repeatStatus={repeatStatus}
        speed={speed}
        tracks={tracks}
        tracksInRange={tracksInRange}
        onDefaultRepeatCountChange={(value) => {
          setDefaultRepeatCount(value);
          setRepeatStep(0);
        }}
        onLoopRangeChange={setLoopRange}
        onRangeEndChange={updateRangeEnd}
        onRangeStartChange={updateRangeStart}
        onResetRangeRepeatOverrides={resetRangeRepeatOverrides}
        onSpeedChange={setSpeed}
        onTrackRepeatCountChange={setTrackRepeatCount}
      />
    </section>
  );
}
