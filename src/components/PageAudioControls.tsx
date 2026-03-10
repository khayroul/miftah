"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export interface PageAudioTrack {
  key: string;
  label: string;
  audioUrl: string;
  bm: string | null;
}

interface PageAudioControlsProps {
  tracks: PageAudioTrack[];
  onPlaybackAyahChange?: (ayahKey: string | null) => void;
}

const SPEED_OPTIONS = [0.75, 1, 1.25, 1.5] as const;
const REPEAT_OPTIONS = [1, 2, 3, 5, 10, -1] as const;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function repeatLabel(value: number): string {
  if (value === -1) {
    return "∞ (loop)";
  }
  return `${value}x`;
}

function normalizeRepeatValue(rawValue: string): number {
  const parsed = Number.parseInt(rawValue, 10);
  if (
    REPEAT_OPTIONS.includes(
      parsed as (typeof REPEAT_OPTIONS)[number],
    )
  ) {
    return parsed;
  }
  return 1;
}

export function PageAudioControls({
  tracks,
  onPlaybackAyahChange,
}: PageAudioControlsProps) {
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
      return "Loop current ayah";
    }

    return repeatsRemaining > 0
      ? `${repeatsRemaining} repeat left`
      : "No repeat pending";
  }, [currentRepeatCount, repeatsRemaining]);

  const rangeStatus = useMemo(() => {
    const startTrack = tracks[normalizedRangeStart];
    const endTrack = tracks[normalizedRangeEnd];
    if (!startTrack || !endTrack) {
      return null;
    }
    return `${startTrack.label} -> ${endTrack.label} (${tracksInRange.length} ayat)`;
  }, [normalizedRangeEnd, normalizedRangeStart, tracks, tracksInRange.length]);

  if (!canPlayAudio || !currentTrack) {
    return (
      <section className="rounded-2xl border border-stone-300 bg-white px-3 py-3 shadow-sm sm:px-4 dark:border-stone-600 dark:bg-stone-900">
        <p className="text-xs font-medium uppercase tracking-wide text-stone-500 dark:text-stone-400">
          Audio
        </p>
        <p className="mt-2 text-sm text-stone-600 dark:text-stone-300">
          Tiada audio URL untuk ayat pada halaman ini.
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
        Audio
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
        <p className="text-sm font-medium text-stone-900 dark:text-stone-100">Now playing: {currentTrack.label}</p>
        <p className="mt-1 text-xs text-stone-600 line-clamp-2 dark:text-stone-300">
          {currentTrack.bm ?? "Tiada terjemahan BM"}
        </p>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => goToTrack(safeIndex - 1)}
          disabled={!canPrev}
          className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm text-stone-700 transition enabled:hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-stone-600 dark:text-stone-200 dark:enabled:hover:bg-stone-800"
        >
          Prev Ayah
        </button>
        <button
          type="button"
          onClick={togglePlayback}
          className="rounded-lg bg-stone-900 px-3 py-1.5 text-sm text-stone-50 transition hover:bg-stone-700 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-300"
        >
          {isPlaying ? "Pause" : "Play"}
        </button>
        <button
          type="button"
          onClick={() => goToTrack(safeIndex + 1)}
          disabled={!canNext}
          className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm text-stone-700 transition enabled:hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-stone-600 dark:text-stone-200 dark:enabled:hover:bg-stone-800"
        >
          Next Ayah
        </button>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <label className="text-xs text-stone-600 dark:text-stone-300">
          Speed
          <select
            value={String(speed)}
            onChange={(event) => setSpeed(Number.parseFloat(event.target.value))}
            className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-sm text-stone-900 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100"
          >
            {SPEED_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}x
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs text-stone-600 dark:text-stone-300">
          Repeat (default)
          <select
            value={String(defaultRepeatCount)}
            onChange={(event) => {
              setDefaultRepeatCount(normalizeRepeatValue(event.target.value));
              setRepeatStep(0);
            }}
            className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-sm text-stone-900 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100"
          >
            {REPEAT_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {repeatLabel(option)}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-end gap-2 text-xs text-stone-600 dark:text-stone-300">
          <input
            type="checkbox"
            checked={loopRange}
            onChange={(event) => setLoopRange(event.target.checked)}
            className="h-4 w-4 rounded border-stone-300 text-stone-900 dark:border-stone-600 dark:bg-stone-900"
          />
          <span>Loop selected range</span>
        </label>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <label className="text-xs text-stone-600 dark:text-stone-300">
          Range Start
          <select
            value={String(normalizedRangeStart)}
            onChange={(event) =>
              updateRangeStart(Number.parseInt(event.target.value, 10))
            }
            className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-sm text-stone-900 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100"
          >
            {tracks.map((track, index) => (
              <option key={`start-${track.key}`} value={index}>
                {track.label}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs text-stone-600 dark:text-stone-300">
          Range End
          <select
            value={String(normalizedRangeEnd)}
            onChange={(event) =>
              updateRangeEnd(Number.parseInt(event.target.value, 10))
            }
            className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-sm text-stone-900 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100"
          >
            {tracks.map((track, index) => (
              <option key={`end-${track.key}`} value={index}>
                {track.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {rangeStatus ? (
        <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">Active range: {rangeStatus}</p>
      ) : null}

      <details className="mt-3 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 dark:border-stone-700 dark:bg-stone-800/45">
        <summary className="cursor-pointer text-xs font-medium uppercase tracking-wide text-stone-600 dark:text-stone-300">
          Per-Ayah Repeat
        </summary>
        <div className="mt-3 space-y-3">
          <button
            type="button"
            onClick={resetRangeRepeatOverrides}
            className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs text-stone-700 transition hover:bg-stone-100 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-800"
          >
            Reset Range to Default Repeat
          </button>
          <div className="grid gap-2 sm:grid-cols-2">
            {tracksInRange.map((track) => {
              const value = repeatByTrack[track.key] ?? defaultRepeatCount;
              return (
                <label key={`repeat-${track.key}`} className="text-xs text-stone-600 dark:text-stone-300">
                  {track.label}
                  <select
                    value={String(value)}
                    onChange={(event) =>
                      setTrackRepeatCount(
                        track.key,
                        normalizeRepeatValue(event.target.value),
                      )
                    }
                    className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-sm text-stone-900 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100"
                  >
                    {REPEAT_OPTIONS.map((option) => (
                      <option key={`${track.key}-${option}`} value={option}>
                        {repeatLabel(option)}
                      </option>
                    ))}
                  </select>
                </label>
              );
            })}
          </div>
        </div>
      </details>

      <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">{repeatStatus}</p>
    </section>
  );
}
