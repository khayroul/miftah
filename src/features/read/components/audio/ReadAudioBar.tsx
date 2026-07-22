import { useTranslations } from "next-intl";
import type { ReadAudioTrack } from "../../domain/audio/pageAudioTracks";
import {
  formatTrackLabel,
  rangePresetShortLabel,
  SPEED_OPTIONS,
  speedLabel,
  type RangePreset,
} from "./readAudioDockTypes";

interface ReadAudioBarProps {
  canPlay: boolean;
  isPlaying: boolean;
  safeIndex: number;
  normalizedRangeEnd: number;
  rangePreset: RangePreset;
  playbackRate: number;
  currentTrack: ReadAudioTrack | null;
  hasPlaybackCap: boolean;
  onTogglePlayback: () => void;
  onNextTrack: () => void;
  onCycleRangePreset: () => void;
  onPlaybackRateChange: (rate: number) => void;
  onTogglePanel: () => void;
}

export function ReadAudioBar(props: ReadAudioBarProps) {
  const {
    canPlay, isPlaying, safeIndex, normalizedRangeEnd, rangePreset,
    playbackRate, currentTrack, hasPlaybackCap,
    onTogglePlayback, onNextTrack, onCycleRangePreset,
    onPlaybackRateChange, onTogglePanel,
  } = props;
  const t = useTranslations("read.audioDock");

  return (
    <div className="flex items-center gap-2 px-2.5 py-2.5 sm:gap-3 sm:px-4 sm:py-3">
      <button type="button" onClick={onTogglePlayback} disabled={!canPlay} className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-teal-300 bg-teal-50 text-teal-800 transition hover:bg-teal-100 disabled:cursor-not-allowed disabled:opacity-45 dark:border-teal-700/60 dark:bg-teal-900/35 dark:text-teal-100 dark:hover:bg-teal-900/55 sm:h-12 sm:w-12" aria-label={isPlaying ? t("pauseAudioAria") : t("playAudioAria")}>
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

      <button type="button" onClick={onNextTrack} disabled={!canPlay || safeIndex >= normalizedRangeEnd} className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-stone-300 text-stone-700 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-45 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-800 sm:h-12 sm:w-12" aria-label={t("nextVerseAria")}>
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 5l8 7-8 7" />
        </svg>
      </button>

      <button type="button" onClick={onCycleRangePreset} disabled={!canPlay} className="inline-flex h-11 shrink-0 items-center rounded-full border border-stone-300 px-2.5 text-xs font-medium text-stone-700 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-45 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-800 sm:h-12 sm:px-3 sm:text-sm" aria-label={t("changeRangeAria")}>
        {t("rangeButtonLabel", { preset: rangePresetShortLabel(rangePreset, t) })}
      </button>

      <button type="button" onClick={() => {
        const currentIdx = SPEED_OPTIONS.indexOf(playbackRate as typeof SPEED_OPTIONS[number]);
        const nextRate = SPEED_OPTIONS[(currentIdx + 1) % SPEED_OPTIONS.length] ?? 1;
        onPlaybackRateChange(nextRate);
        localStorage.setItem("miftah:audio-speed", String(nextRate));
      }} disabled={!canPlay} className="inline-flex h-11 shrink-0 items-center rounded-full border border-stone-300 px-2.5 text-xs font-medium text-stone-700 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-45 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-800 sm:h-12 sm:px-3 sm:text-sm" aria-label={t("changeSpeedAria")}>
        {speedLabel(playbackRate)}
      </button>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-stone-900 sm:text-base dark:text-stone-100">Mishary Al-Afasy</p>
        <p className="truncate text-xs text-stone-500 sm:text-sm dark:text-stone-400">
          {currentTrack
            ? `${t("nowPlayingAyah", { label: formatTrackLabel(currentTrack) })}${hasPlaybackCap ? t("followingHifzChunkSuffix") : ""}`
            : t("noAudioForOpenVerse")}
        </p>
      </div>

      <button type="button" onClick={onTogglePanel} disabled={!canPlay} className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-teal-300 text-teal-800 transition hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-45 dark:border-teal-700/60 dark:text-teal-100 dark:hover:bg-teal-900/35 sm:h-12 sm:w-12" aria-label={t("openAdvancedControlsAria")}>
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="6" cy="12" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="18" cy="12" r="2" />
        </svg>
      </button>
    </div>
  );
}
