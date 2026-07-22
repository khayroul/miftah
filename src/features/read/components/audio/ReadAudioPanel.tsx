import { useTranslations } from "next-intl";
import type { ReadAudioTrack } from "../../domain/audio/pageAudioTracks";
import { trackReadAudioTelemetry } from "../../domain/audio/readAudioTelemetry";
import {
  formatTrackLabel,
  RANGE_PRESET_VALUES,
  rangePresetLabel,
  REPEAT_OPTIONS,
  SPEED_OPTIONS,
  speedLabel,
  type RangePreset,
  type RepeatOption,
} from "./readAudioDockTypes";

interface SegmentedRepeatProps {
  title: string;
  value: RepeatOption;
  onChange: (next: RepeatOption) => void;
  t: (key: string, values?: Record<string, string | number>) => string;
}

function repeatLabel(
  value: RepeatOption,
  t: (key: string, values?: Record<string, string | number>) => string,
): string {
  if (value === -1) return t("repeat.unlimited");
  return t("repeat.count", { count: value });
}

function SegmentedRepeat({ title, value, onChange, t }: SegmentedRepeatProps) {
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
              {repeatLabel(option, t)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface ReadAudioPanelProps {
  tracks: ReadAudioTrack[];
  safeIndex: number;
  rangePreset: RangePreset;
  normalizedRangeStart: number;
  normalizedRangeEnd: number;
  expandedLoading: boolean;
  rangeSummary: string | null;
  hasPlaybackCap: boolean;
  repeatEachVerse: RepeatOption;
  repeatSet: RepeatOption;
  playbackRate: number;
  onClose: () => void;
  onApplyRangePreset: (preset: RangePreset, startIndex: number) => void;
  onRangeEndChange: (index: number) => void;
  onRepeatEachVerseChange: (value: RepeatOption) => void;
  onRepeatSetChange: (value: RepeatOption) => void;
  onPlaybackRateChange: (rate: number) => void;
  onPreviousTrack: () => void;
  onNextTrack: () => void;
}

export function ReadAudioPanel(props: ReadAudioPanelProps) {
  const {
    tracks, safeIndex, rangePreset, normalizedRangeStart, normalizedRangeEnd,
    expandedLoading, rangeSummary, hasPlaybackCap, repeatEachVerse, repeatSet,
    playbackRate, onClose, onApplyRangePreset, onRangeEndChange,
    onRepeatEachVerseChange, onRepeatSetChange, onPlaybackRateChange,
    onPreviousTrack, onNextTrack,
  } = props;
  const currentRangeTracks = tracks.slice(normalizedRangeStart, normalizedRangeEnd + 1);
  const t = useTranslations("read.audioDock");

  return (
    <div className="max-h-[68vh] overflow-y-auto border-t border-stone-200 px-4 pb-4 pt-3 dark:border-stone-700">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-base font-medium text-stone-900 dark:text-stone-100">{t("settingsTitle")}</p>
        <button type="button" onClick={onClose} className="inline-flex min-h-11 items-center rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-100 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-800">{t("closeButton")}</button>
      </div>

      <div>
        <p className="mb-2 text-[13px] font-medium uppercase tracking-wide text-stone-500 sm:text-sm dark:text-stone-400">{t("adjustRangeLabel")}</p>
        <div className="grid grid-cols-3 gap-2">
          {RANGE_PRESET_VALUES.map((preset) => {
            const active = rangePreset === preset;
            return (
              <button key={preset} type="button" onClick={() => {
                trackReadAudioTelemetry("read_audio_range_preset", { from: rangePreset, to: preset, source: "panel" });
                onApplyRangePreset(preset, normalizedRangeStart);
              }} className={`min-h-11 rounded-full px-3 py-2 text-[15px] font-medium transition sm:text-base ${active ? "bg-teal-700 text-white shadow-sm dark:bg-teal-500 dark:text-teal-950" : "border border-stone-300 text-stone-600 hover:bg-stone-100 dark:border-stone-600 dark:text-stone-300 dark:hover:bg-stone-800"}`}>
                {rangePresetLabel(preset, t)}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-sm text-stone-600 dark:text-stone-300">{t("fromLabel")}
          <select value={String(normalizedRangeStart)} onChange={(event) => onApplyRangePreset(rangePreset, Number.parseInt(event.target.value, 10))} className="mt-1.5 h-11 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 sm:text-base dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100">
            {tracks.map((track, index) => <option key={`from-${track.key}`} value={index}>{formatTrackLabel(track)}</option>)}
          </select>
        </label>
        <label className="text-sm text-stone-600 dark:text-stone-300">{t("toLabel")}
          <select value={String(normalizedRangeEnd)} onChange={(event) => onRangeEndChange(Number.parseInt(event.target.value, 10))} className="mt-1.5 h-11 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 sm:text-base dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100">
            {tracks.map((track, index) => <option key={`to-${track.key}`} value={index}>{formatTrackLabel(track)}</option>)}
          </select>
        </label>
      </div>

      {expandedLoading ? <p className="mt-2 text-sm text-teal-600 dark:text-teal-400">{t("loadingFullAudio", { scope: rangePreset === "surah" ? "surah" : "juz" })}</p>
        : rangeSummary ? <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">{t("nowPlayingSummary", { summary: rangeSummary })}</p> : null}
      {hasPlaybackCap ? <p className="mt-1 text-sm text-teal-700 dark:text-teal-300">{t("hifzModeActiveNotice")}</p> : null}

      <div className="mt-4"><SegmentedRepeat title={t("repeatEachVerseLabel")} value={repeatEachVerse} onChange={onRepeatEachVerseChange} t={t} /></div>
      <div className="mt-4"><SegmentedRepeat title={t("repeatSetLabel")} value={repeatSet} onChange={onRepeatSetChange} t={t} /></div>
      <div className="mt-4">
        <p className="mb-2 text-sm font-medium text-stone-600 dark:text-stone-400">{t("audioSpeedLabel")}</p>
        <div className="flex gap-2">
          {SPEED_OPTIONS.map((rate) => <button key={rate} type="button" onClick={() => {
            onPlaybackRateChange(rate);
            localStorage.setItem("miftah:audio-speed", String(rate));
          }} className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition ${playbackRate === rate ? "border-teal-400 bg-teal-50 text-teal-800 dark:border-teal-600 dark:bg-teal-900/30 dark:text-teal-200" : "border-stone-300 text-stone-600 hover:bg-stone-100 dark:border-stone-600 dark:text-stone-300 dark:hover:bg-stone-800"}`}>{speedLabel(rate)}</button>)}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-2">
        <button type="button" onClick={onPreviousTrack} disabled={safeIndex <= normalizedRangeStart} className="min-h-11 rounded-lg border border-stone-300 px-4 py-2 text-sm text-stone-700 transition enabled:hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-45 dark:border-stone-600 dark:text-stone-200 dark:enabled:hover:bg-stone-800">{t("prevVerseButton")}</button>
        <button type="button" onClick={onNextTrack} disabled={safeIndex >= normalizedRangeEnd} className="min-h-11 rounded-lg border border-stone-300 px-4 py-2 text-sm text-stone-700 transition enabled:hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-45 dark:border-stone-600 dark:text-stone-200 dark:enabled:hover:bg-stone-800">{t("nextVerseButton")}</button>
      </div>
      {currentRangeTracks.length === 0 ? <p className="mt-3 text-sm text-stone-500 dark:text-stone-400">{t("noVersesInRange")}</p> : null}
    </div>
  );
}
