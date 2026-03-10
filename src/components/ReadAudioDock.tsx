"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReadAudioTrack } from "@/lib/pageAudioTracks";

interface ReadAudioDockProps {
  tracks: ReadAudioTrack[];
  onRequestClose: () => void;
}

type RangePreset = "page" | "surah" | "juz";
type RepeatOption = 1 | 2 | 3 | -1;

const RANGE_PRESETS: Array<{ value: RangePreset; label: string }> = [
  { value: "page", label: "Page" },
  { value: "surah", label: "Surah" },
  { value: "juz", label: "Juz" },
];

const REPEAT_OPTIONS: RepeatOption[] = [1, 2, 3, -1];

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function repeatLabel(value: RepeatOption): string {
  if (value === -1) {
    return "loop";
  }
  if (value === 1) {
    return "1 time";
  }
  return `${value} times`;
}

function formatTrackLabel(track: ReadAudioTrack): string {
  return `${track.surahId}:${track.ayahNumber}`;
}

function resolvePresetEndIndex(
  tracks: ReadAudioTrack[],
  startIndex: number,
  preset: RangePreset,
): number {
  if (tracks.length === 0) {
    return 0;
  }

  const safeStartIndex = clamp(startIndex, 0, tracks.length - 1);
  if (preset === "page") {
    return tracks.length - 1;
  }

  const startTrack = tracks[safeStartIndex];
  if (!startTrack) {
    return tracks.length - 1;
  }

  let endIndex = safeStartIndex;
  for (let index = safeStartIndex; index < tracks.length; index += 1) {
    const track = tracks[index];
    if (!track) {
      break;
    }

    const sameScope =
      preset === "surah"
        ? track.surahId === startTrack.surahId
        : track.juzNumber === startTrack.juzNumber;
    if (!sameScope) {
      break;
    }
    endIndex = index;
  }

  return endIndex;
}

interface SegmentedRepeatProps {
  title: string;
  value: RepeatOption;
  onChange: (next: RepeatOption) => void;
}

function SegmentedRepeat({ title, value, onChange }: SegmentedRepeatProps) {
  return (
    <div>
      <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-stone-500 dark:text-stone-400">
        {title}
      </p>
      <div className="grid grid-cols-4 rounded-xl border border-stone-200 bg-stone-100 p-1 dark:border-stone-700 dark:bg-stone-800">
        {REPEAT_OPTIONS.map((option) => {
          const selected = value === option;
          return (
            <button
              key={`${title}-${option}`}
              type="button"
              onClick={() => onChange(option)}
              className={`rounded-lg px-2 py-2 text-xs font-medium transition ${
                selected
                  ? "bg-white text-stone-900 shadow-sm dark:bg-stone-200 dark:text-stone-900"
                  : "text-stone-600 hover:bg-white/60 dark:text-stone-300 dark:hover:bg-stone-700"
              }`}
            >
              {repeatLabel(option)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ReadAudioDock({
  tracks,
  onRequestClose,
}: ReadAudioDockProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const shouldAutoplayRef = useRef(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [rangePreset, setRangePreset] = useState<RangePreset>("page");
  const [rangeStartIndex, setRangeStartIndex] = useState(0);
  const [rangeEndIndex, setRangeEndIndex] = useState(() =>
    Math.max(tracks.length - 1, 0),
  );
  const [repeatEachVerse, setRepeatEachVerse] = useState<RepeatOption>(1);
  const [repeatSet, setRepeatSet] = useState<RepeatOption>(1);
  const [repeatEachStep, setRepeatEachStep] = useState(0);
  const [repeatSetStep, setRepeatSetStep] = useState(0);

  const maxIndex = Math.max(tracks.length - 1, 0);
  const clampedRangeStart = clamp(rangeStartIndex, 0, maxIndex);
  const clampedRangeEnd = clamp(rangeEndIndex, 0, maxIndex);
  const normalizedRangeStart = Math.min(clampedRangeStart, clampedRangeEnd);
  const normalizedRangeEnd = Math.max(clampedRangeStart, clampedRangeEnd);
  const safeIndex = tracks.length
    ? clamp(currentIndex, normalizedRangeStart, normalizedRangeEnd)
    : 0;
  const currentTrack = tracks[safeIndex] ?? null;
  const canPlay = currentTrack !== null;

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

  const rangeSummary = useMemo(() => {
    const startTrack = tracks[normalizedRangeStart];
    const endTrack = tracks[normalizedRangeEnd];
    if (!startTrack || !endTrack) {
      return null;
    }
    const count = normalizedRangeEnd - normalizedRangeStart + 1;
    return `${formatTrackLabel(startTrack)} → ${formatTrackLabel(endTrack)} (${count} ayat)`;
  }, [normalizedRangeEnd, normalizedRangeStart, tracks]);

  const applyRangePreset = (preset: RangePreset, startIndex: number) => {
    const nextStart = clamp(startIndex, 0, maxIndex);
    const nextEnd = resolvePresetEndIndex(tracks, nextStart, preset);
    setRangePreset(preset);
    setRangeStartIndex(nextStart);
    setRangeEndIndex(clamp(nextEnd, nextStart, maxIndex));
    if (safeIndex < nextStart || safeIndex > nextEnd) {
      shouldAutoplayRef.current = isPlaying;
      setCurrentIndex(nextStart);
    }
    setRepeatEachStep(0);
    setRepeatSetStep(0);
  };

  const goToTrack = (targetIndex: number) => {
    if (targetIndex < normalizedRangeStart || targetIndex > normalizedRangeEnd) {
      return;
    }
    shouldAutoplayRef.current = isPlaying;
    setCurrentIndex(targetIndex);
    setRepeatEachStep(0);
  };

  const togglePlayback = async () => {
    const audio = audioRef.current;
    if (!audio || !canPlay) {
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

  const handleAudioEnded = () => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) {
      return;
    }

    if (repeatEachVerse === -1) {
      audio.currentTime = 0;
      audio.play().catch(() => setIsPlaying(false));
      return;
    }

    if (repeatEachStep < repeatEachVerse - 1) {
      setRepeatEachStep((current) => current + 1);
      audio.currentTime = 0;
      audio.play().catch(() => setIsPlaying(false));
      return;
    }

    setRepeatEachStep(0);
    if (safeIndex < normalizedRangeEnd) {
      shouldAutoplayRef.current = true;
      setCurrentIndex(safeIndex + 1);
      return;
    }

    if (repeatSet === -1) {
      shouldAutoplayRef.current = true;
      setCurrentIndex(normalizedRangeStart);
      return;
    }

    if (repeatSetStep < repeatSet - 1) {
      setRepeatSetStep((current) => current + 1);
      shouldAutoplayRef.current = true;
      setCurrentIndex(normalizedRangeStart);
      return;
    }

    setRepeatSetStep(0);
    setIsPlaying(false);
  };

  const currentRangeTracks = tracks.slice(normalizedRangeStart, normalizedRangeEnd + 1);

  return (
    <div className="fixed inset-x-0 bottom-0 z-50">
      <audio
        ref={audioRef}
        preload="metadata"
        src={currentTrack?.audioUrl}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={handleAudioEnded}
      />

      <div className="mx-auto w-full max-w-4xl px-2 pb-[calc(12px+env(safe-area-inset-bottom))] sm:px-4">
        <section className="rounded-[24px] border border-stone-200 bg-white/96 shadow-[0_16px_44px_rgba(0,0,0,0.18)] backdrop-blur dark:border-stone-700 dark:bg-stone-900/94">
          <div className="flex items-center gap-3 px-4 py-3">
            <button
              type="button"
              onClick={togglePlayback}
              disabled={!canPlay}
              className="grid h-11 w-11 place-items-center rounded-full border border-teal-300 bg-teal-50 text-teal-800 transition hover:bg-teal-100 disabled:cursor-not-allowed disabled:opacity-45 dark:border-teal-700/60 dark:bg-teal-900/35 dark:text-teal-100 dark:hover:bg-teal-900/55"
              aria-label={isPlaying ? "Pause audio" : "Play audio"}
            >
              {isPlaying ? (
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="5" width="4" height="14" rx="1" />
                  <rect x="14" y="5" width="4" height="14" rx="1" />
                </svg>
              ) : (
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8.5 6.2c0-.8.9-1.3 1.6-.8l8.2 5.8a1 1 0 0 1 0 1.6L10.1 18.6c-.7.5-1.6 0-1.6-.8V6.2Z" />
                </svg>
              )}
            </button>

            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-medium text-stone-900 dark:text-stone-100">
                Mishary Al-Afasy
              </p>
              <p className="truncate text-xs text-stone-500 dark:text-stone-400">
                {currentTrack ? `Ayat ${formatTrackLabel(currentTrack)}` : "Tiada audio untuk halaman ini"}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setPanelOpen((open) => !open)}
              disabled={!canPlay}
              className="grid h-11 w-11 place-items-center rounded-full border border-teal-300 text-teal-800 transition hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-45 dark:border-teal-700/60 dark:text-teal-100 dark:hover:bg-teal-900/35"
              aria-label="Buka tetapan audio"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="6" cy="12" r="2" />
                <circle cx="12" cy="12" r="2" />
                <circle cx="18" cy="12" r="2" />
              </svg>
            </button>
          </div>

          {panelOpen ? (
            <div className="max-h-[68vh] overflow-y-auto border-t border-stone-200 px-4 pb-4 pt-3 dark:border-stone-700">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-stone-900 dark:text-stone-100">
                  Tetapan Audio
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setPanelOpen(false);
                    onRequestClose();
                  }}
                  className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs text-stone-700 transition hover:bg-stone-100 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-800"
                >
                  Tutup
                </button>
              </div>

              <div>
                <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-stone-500 dark:text-stone-400">
                  Adjust End Verse To The End Of The
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {RANGE_PRESETS.map((preset) => {
                    const active = rangePreset === preset.value;
                    return (
                      <button
                        key={preset.value}
                        type="button"
                        onClick={() => applyRangePreset(preset.value, normalizedRangeStart)}
                        className={`rounded-full px-3 py-2 text-sm font-medium transition ${
                          active
                            ? "bg-teal-700 text-white shadow-sm dark:bg-teal-500 dark:text-teal-950"
                            : "border border-stone-300 text-stone-600 hover:bg-stone-100 dark:border-stone-600 dark:text-stone-300 dark:hover:bg-stone-800"
                        }`}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="text-xs text-stone-600 dark:text-stone-300">
                  From
                  <select
                    value={String(normalizedRangeStart)}
                    onChange={(event) => {
                      const nextStart = Number.parseInt(event.target.value, 10);
                      applyRangePreset(rangePreset, nextStart);
                    }}
                    className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100"
                  >
                    {tracks.map((track, index) => (
                      <option key={`from-${track.key}`} value={index}>
                        {formatTrackLabel(track)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-xs text-stone-600 dark:text-stone-300">
                  To
                  <select
                    value={String(normalizedRangeEnd)}
                    onChange={(event) =>
                      setRangeEndIndex(Number.parseInt(event.target.value, 10))
                    }
                    className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100"
                  >
                    {tracks.map((track, index) => (
                      <option key={`to-${track.key}`} value={index}>
                        {formatTrackLabel(track)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {rangeSummary ? (
                <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">
                  Playing: {rangeSummary}
                </p>
              ) : null}

              <div className="mt-4">
                <SegmentedRepeat
                  title="Play each verse"
                  value={repeatEachVerse}
                  onChange={(next) => {
                    setRepeatEachVerse(next);
                    setRepeatEachStep(0);
                  }}
                />
              </div>

              <div className="mt-4">
                <SegmentedRepeat
                  title="Play set of verses"
                  value={repeatSet}
                  onChange={(next) => {
                    setRepeatSet(next);
                    setRepeatSetStep(0);
                  }}
                />
              </div>

              <div className="mt-4 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => goToTrack(safeIndex - 1)}
                  disabled={safeIndex <= normalizedRangeStart}
                  className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs text-stone-700 transition enabled:hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-45 dark:border-stone-600 dark:text-stone-200 dark:enabled:hover:bg-stone-800"
                >
                  Prev Ayah
                </button>
                <button
                  type="button"
                  onClick={() => goToTrack(safeIndex + 1)}
                  disabled={safeIndex >= normalizedRangeEnd}
                  className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs text-stone-700 transition enabled:hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-45 dark:border-stone-600 dark:text-stone-200 dark:enabled:hover:bg-stone-800"
                >
                  Next Ayah
                </button>
              </div>

              {currentRangeTracks.length === 0 ? (
                <p className="mt-3 text-xs text-stone-500 dark:text-stone-400">
                  Tiada ayat dalam julat sekarang.
                </p>
              ) : null}
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
