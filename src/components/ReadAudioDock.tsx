"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReadAudioTrack } from "@/lib/pageAudioTracks";
import { trackReadAudioTelemetry } from "@/lib/readAudioTelemetry";
import { resolveReadAudioLoopAction } from "@/lib/readAudioLoop";
import { resolveReadAudioPageStartFromAyah } from "@/lib/readAudioStart";

interface ReadAudioDockProps {
  autoplayRequestKey?: number;
  pauseRequestKey?: number;
  restartRequestKey?: number;
  startFromAyahKey?: string | null;
  startFromAyahRequestKey?: number;
  tracks: ReadAudioTrack[];
  playableAyahKeys?: string[] | null;
  visible?: boolean;
  onPlaybackAyahChange?: (ayahKey: string | null) => void;
  onPanelOpenChange?: (isOpen: boolean) => void;
}

type RangePreset = "page" | "surah" | "juz";
type RepeatOption = 1 | 2 | 3 | -1;

const RANGE_PRESETS: Array<{ value: RangePreset; label: string }> = [
  { value: "page", label: "Halaman" },
  { value: "surah", label: "Surah" },
  { value: "juz", label: "Juz" },
];
const RANGE_PRESET_SHORT_LABEL: Record<RangePreset, string> = {
  page: "Hlm",
  surah: "Surah",
  juz: "Juz",
};

const REPEAT_OPTIONS: RepeatOption[] = [1, 2, 3, -1];

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function repeatLabel(value: RepeatOption): string {
  if (value === -1) {
    return "ulang tanpa henti";
  }
  if (value === 1) {
    return "1 kali";
  }
  return `${value} kali`;
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
      <p className="mb-2 text-[13px] font-medium uppercase tracking-wide text-stone-500 sm:text-sm dark:text-stone-400">
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
              className={`min-h-11 rounded-lg px-2 py-2 text-sm font-medium transition ${
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
}: ReadAudioDockProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const shouldAutoplayRef = useRef(false);
  const wasPanelVisibleRef = useRef(false);
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
  const playableAyahKeySet = useMemo(() => {
    if (!playableAyahKeys || playableAyahKeys.length === 0) {
      return null;
    }
    return new Set(playableAyahKeys);
  }, [playableAyahKeys]);
  const tracks = useMemo(() => {
    if (!playableAyahKeySet) {
      return sourceTracks;
    }
    return sourceTracks.filter((track) => playableAyahKeySet.has(track.key));
  }, [playableAyahKeySet, sourceTracks]);
  const hasPlaybackCap =
    playableAyahKeySet !== null && tracks.length < sourceTracks.length;

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
    if (!shouldAutoplayRef.current) {
      return;
    }
    shouldAutoplayRef.current = false;
    audio.play().catch(() => {
      audio.pause();
    });
  }, [currentTrack?.audioUrl, safeIndex]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !canPlay || autoplayRequestKey === 0) {
      return;
    }

    shouldAutoplayRef.current = false;
    audio.play().then(() => {
      setIsPlaying(true);
    }).catch(() => {
      setIsPlaying(false);
    });
  }, [autoplayRequestKey, canPlay, currentTrack?.audioUrl]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || pauseRequestKey === 0) {
      return;
    }

    audio.pause();
  }, [pauseRequestKey]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !canPlay || restartRequestKey === 0) {
      return;
    }

    const restartIndex = normalizedRangeStart;
    if (safeIndex !== restartIndex) {
      const frame = window.requestAnimationFrame(() => {
        shouldAutoplayRef.current = true;
        setCurrentIndex(restartIndex);
      });
      return () => {
        window.cancelAnimationFrame(frame);
      };
    }

    audio.currentTime = 0;
    audio.play().then(() => {
      setIsPlaying(true);
    }).catch(() => {
      setIsPlaying(false);
    });
  }, [canPlay, normalizedRangeStart, restartRequestKey, safeIndex]);

  useEffect(() => {
    if (startFromAyahRequestKey === 0 || !startFromAyahKey || tracks.length === 0) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const selection = resolveReadAudioPageStartFromAyah(tracks, startFromAyahKey);
      if (!selection) {
        return;
      }

      setRangePreset("page");
      setRangeStartIndex(selection.rangeStartIndex);
      setRangeEndIndex(selection.rangeEndIndex);
      setRepeatEachStep(0);
      setRepeatSetStep(0);

      const audio = audioRef.current;
      const isSameTrack =
        safeIndex === selection.currentIndex && currentTrack?.key === startFromAyahKey;

      if (isSameTrack && audio) {
        audio.currentTime = 0;
        audio.play().then(() => {
          setIsPlaying(true);
        }).catch(() => {
          setIsPlaying(false);
        });
        return;
      }

      shouldAutoplayRef.current = true;
      setCurrentIndex(selection.currentIndex);
      setIsPlaying(false);
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [
    currentTrack?.key,
    safeIndex,
    startFromAyahKey,
    startFromAyahRequestKey,
    tracks,
  ]);

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

  const handleNextTrack = () => {
    if (safeIndex >= normalizedRangeEnd) {
      return;
    }
    trackReadAudioTelemetry("read_audio_next", {
      currentAyah: currentTrack?.key ?? null,
      nextIndex: safeIndex + 1,
    });
    goToTrack(safeIndex + 1);
  };

  const cycleRangePreset = () => {
    const orderedPresets: RangePreset[] = ["page", "surah", "juz"];
    const currentPresetIndex = orderedPresets.indexOf(rangePreset);
    const nextPreset =
      orderedPresets[(currentPresetIndex + 1) % orderedPresets.length] ?? "page";
    trackReadAudioTelemetry("read_audio_range_preset", {
      from: rangePreset,
      to: nextPreset,
      fromAyah: tracks[normalizedRangeStart]?.key ?? null,
    });
    applyRangePreset(nextPreset, safeIndex);
  };

  const togglePlayback = async () => {
    const audio = audioRef.current;
    if (!audio || !canPlay) {
      return;
    }
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
      trackReadAudioTelemetry("read_audio_drop_off", {
        source: "manual_pause",
        ayah: currentTrack?.key ?? null,
      });
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

    const nextAction = resolveReadAudioLoopAction({
      currentIndex: safeIndex,
      rangeStartIndex: normalizedRangeStart,
      rangeEndIndex: normalizedRangeEnd,
      repeatEachVerse,
      repeatSet,
      repeatEachStep,
      repeatSetStep,
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
  };

  const currentRangeTracks = tracks.slice(normalizedRangeStart, normalizedRangeEnd + 1);
  const panelContent = (
    <div className="max-h-[68vh] overflow-y-auto border-t border-stone-200 px-4 pb-4 pt-3 dark:border-stone-700">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-base font-medium text-stone-900 dark:text-stone-100">
          Tetapan Audio
        </p>
        <button
          type="button"
          onClick={() => {
            setPanelOpen(false);
          }}
          className="inline-flex min-h-11 items-center rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-100 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-800"
        >
          Tutup
        </button>
      </div>

      <div>
        <p className="mb-2 text-[13px] font-medium uppercase tracking-wide text-stone-500 sm:text-sm dark:text-stone-400">
          Laraskan julat hingga hujung
        </p>
        <div className="grid grid-cols-3 gap-2">
          {RANGE_PRESETS.map((preset) => {
            const active = rangePreset === preset.value;
            return (
              <button
                key={preset.value}
                type="button"
                onClick={() => {
                  trackReadAudioTelemetry("read_audio_range_preset", {
                    from: rangePreset,
                    to: preset.value,
                    source: "panel",
                  });
                  applyRangePreset(preset.value, normalizedRangeStart);
                }}
                className={`min-h-11 rounded-full px-3 py-2 text-[15px] font-medium transition sm:text-base ${
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
        <label className="text-sm text-stone-600 dark:text-stone-300">
          Dari
          <select
            value={String(normalizedRangeStart)}
            onChange={(event) => {
              const nextStart = Number.parseInt(event.target.value, 10);
              applyRangePreset(rangePreset, nextStart);
            }}
            className="mt-1.5 h-11 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 sm:text-base dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100"
          >
            {tracks.map((track, index) => (
              <option key={`from-${track.key}`} value={index}>
                {formatTrackLabel(track)}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm text-stone-600 dark:text-stone-300">
          Hingga
          <select
            value={String(normalizedRangeEnd)}
            onChange={(event) =>
              setRangeEndIndex(Number.parseInt(event.target.value, 10))
            }
            className="mt-1.5 h-11 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 sm:text-base dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100"
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
        <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">
          Sedang dimainkan: {rangeSummary}
        </p>
      ) : null}
      {hasPlaybackCap ? (
        <p className="mt-1 text-sm text-teal-700 dark:text-teal-300">
          Mod Hafal aktif: audio dihadkan kepada ayat yang sudah dibuka.
        </p>
      ) : null}

      <div className="mt-4">
        <SegmentedRepeat
          title="Ulang setiap ayat"
          value={repeatEachVerse}
          onChange={(next) => {
            setRepeatEachVerse(next);
            setRepeatEachStep(0);
            trackReadAudioTelemetry("read_audio_repeat_change", {
              target: "verse",
              value: next,
            });
          }}
        />
      </div>

      <div className="mt-4">
        <SegmentedRepeat
          title="Ulang set ayat"
          value={repeatSet}
          onChange={(next) => {
            setRepeatSet(next);
            setRepeatSetStep(0);
            trackReadAudioTelemetry("read_audio_repeat_change", {
              target: "set",
              value: next,
            });
          }}
        />
      </div>

      <div className="mt-4 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => goToTrack(safeIndex - 1)}
          disabled={safeIndex <= normalizedRangeStart}
          className="min-h-11 rounded-lg border border-stone-300 px-4 py-2 text-sm text-stone-700 transition enabled:hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-45 dark:border-stone-600 dark:text-stone-200 dark:enabled:hover:bg-stone-800"
        >
          Ayat Sebelum
        </button>
        <button
          type="button"
          onClick={handleNextTrack}
          disabled={safeIndex >= normalizedRangeEnd}
          className="min-h-11 rounded-lg border border-stone-300 px-4 py-2 text-sm text-stone-700 transition enabled:hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-45 dark:border-stone-600 dark:text-stone-200 dark:enabled:hover:bg-stone-800"
        >
          Ayat Seterusnya
        </button>
      </div>

      {currentRangeTracks.length === 0 ? (
        <p className="mt-3 text-sm text-stone-500 dark:text-stone-400">
          Tiada ayat dalam julat sekarang.
        </p>
      ) : null}
    </div>
  );

  return (
    <>
      {panelVisible ? (
        <div className="fixed inset-0 z-[65] bg-black/35" onClick={() => setPanelOpen(false)}>
          <section
            className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-4xl rounded-t-[24px] border border-b-0 border-stone-200 bg-white/97 shadow-[0_-16px_44px_rgba(0,0,0,0.24)] backdrop-blur dark:border-stone-700 dark:bg-stone-900/96"
            onClick={(event) => event.stopPropagation()}
          >
            {panelContent}
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
          onEnded={handleAudioEnded}
        />

        <div className="mx-auto w-full max-w-[30rem] px-2 pb-[calc(12px+env(safe-area-inset-bottom))] sm:max-w-4xl sm:px-4">
          <section className="rounded-[22px] border border-stone-200 bg-white/96 shadow-[0_14px_36px_rgba(0,0,0,0.16)] backdrop-blur dark:border-stone-700 dark:bg-stone-900/94 sm:rounded-[24px] sm:shadow-[0_16px_44px_rgba(0,0,0,0.18)]">
            <div className="flex items-center gap-2 px-2.5 py-2.5 sm:gap-3 sm:px-4 sm:py-3">
              <button
                type="button"
                onClick={togglePlayback}
                disabled={!canPlay}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-teal-300 bg-teal-50 text-teal-800 transition hover:bg-teal-100 disabled:cursor-not-allowed disabled:opacity-45 dark:border-teal-700/60 dark:bg-teal-900/35 dark:text-teal-100 dark:hover:bg-teal-900/55 sm:h-12 sm:w-12"
                aria-label={isPlaying ? "Jeda audio" : "Mainkan audio"}
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

              <button
                type="button"
                onClick={handleNextTrack}
                disabled={!canPlay || safeIndex >= normalizedRangeEnd}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-stone-300 text-stone-700 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-45 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-800 sm:h-12 sm:w-12"
                aria-label="Ayat seterusnya"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 5l8 7-8 7" />
                </svg>
              </button>

              <button
                type="button"
                onClick={cycleRangePreset}
                disabled={!canPlay}
                className="inline-flex h-11 shrink-0 items-center rounded-full border border-stone-300 px-2.5 text-xs font-medium text-stone-700 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-45 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-800 sm:h-12 sm:px-3 sm:text-sm"
                aria-label="Tukar tetapan julat"
              >
                Julat {RANGE_PRESET_SHORT_LABEL[rangePreset]}
              </button>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-stone-900 sm:text-base dark:text-stone-100">
                  Mishary Al-Afasy
                </p>
                <p className="truncate text-xs text-stone-500 sm:text-sm dark:text-stone-400">
                  {currentTrack
                    ? `Ayat ${formatTrackLabel(currentTrack)}${hasPlaybackCap ? " · ikut bahagian Hafal" : ""}`
                    : "Tiada audio untuk ayat terbuka"}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setPanelOpen((open) => !open)}
                disabled={!canPlay}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-teal-300 text-teal-800 transition hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-45 dark:border-teal-700/60 dark:text-teal-100 dark:hover:bg-teal-900/35 sm:h-12 sm:w-12"
                aria-label="Buka kawalan lanjut audio"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="6" cy="12" r="2" />
                  <circle cx="12" cy="12" r="2" />
                  <circle cx="18" cy="12" r="2" />
                </svg>
              </button>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
