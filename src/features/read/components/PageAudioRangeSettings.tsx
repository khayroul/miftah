import type { ReadAudioTrack } from "../domain/audio/pageAudioTracks";

const SPEED_OPTIONS = [0.75, 1, 1.25, 1.5] as const;
const REPEAT_OPTIONS = [1, 2, 3, 5, 10, -1] as const;

function repeatLabel(value: number): string {
  return value === -1 ? "∞ (ulang)" : `${value}x`;
}

export function normalizeRepeatValue(rawValue: string): number {
  const parsed = Number.parseInt(rawValue, 10);
  return REPEAT_OPTIONS.some((option) => option === parsed) ? parsed : 1;
}

interface PageAudioRangeSettingsProps {
  defaultRepeatCount: number;
  loopRange: boolean;
  normalizedRangeEnd: number;
  normalizedRangeStart: number;
  rangeStatus: string | null;
  repeatByTrack: Record<string, number>;
  repeatStatus: string;
  speed: number;
  tracks: ReadAudioTrack[];
  tracksInRange: ReadAudioTrack[];
  onDefaultRepeatCountChange: (value: number) => void;
  onLoopRangeChange: (value: boolean) => void;
  onRangeEndChange: (index: number) => void;
  onRangeStartChange: (index: number) => void;
  onResetRangeRepeatOverrides: () => void;
  onSpeedChange: (value: number) => void;
  onTrackRepeatCountChange: (trackKey: string, value: number) => void;
}

export function PageAudioRangeSettings({
  defaultRepeatCount,
  loopRange,
  normalizedRangeEnd,
  normalizedRangeStart,
  rangeStatus,
  repeatByTrack,
  repeatStatus,
  speed,
  tracks,
  tracksInRange,
  onDefaultRepeatCountChange,
  onLoopRangeChange,
  onRangeEndChange,
  onRangeStartChange,
  onResetRangeRepeatOverrides,
  onSpeedChange,
  onTrackRepeatCountChange,
}: PageAudioRangeSettingsProps) {
  return (
    <>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <label className="text-xs text-stone-600 dark:text-stone-300">
          Kelajuan
          <select value={String(speed)} onChange={(event) => onSpeedChange(Number.parseFloat(event.target.value))} className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-sm text-stone-900 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100">
            {SPEED_OPTIONS.map((option) => <option key={option} value={option}>{option}x</option>)}
          </select>
        </label>
        <label className="text-xs text-stone-600 dark:text-stone-300">
          Ulangan asal
          <select value={String(defaultRepeatCount)} onChange={(event) => onDefaultRepeatCountChange(normalizeRepeatValue(event.target.value))} className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-sm text-stone-900 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100">
            {REPEAT_OPTIONS.map((option) => <option key={option} value={option}>{repeatLabel(option)}</option>)}
          </select>
        </label>
        <label className="flex items-end gap-2 text-xs text-stone-600 dark:text-stone-300">
          <input type="checkbox" checked={loopRange} onChange={(event) => onLoopRangeChange(event.target.checked)} className="h-4 w-4 rounded border-stone-300 text-stone-900 dark:border-stone-600 dark:bg-stone-900" />
          <span>Ulang julat pilihan</span>
        </label>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {([["Mula Julat", normalizedRangeStart, onRangeStartChange, "start"], ["Akhir Julat", normalizedRangeEnd, onRangeEndChange, "end"]] as const).map(([label, value, onChange, key]) => (
          <label key={key} className="text-xs text-stone-600 dark:text-stone-300">
            {label}
            <select value={String(value)} onChange={(event) => onChange(Number.parseInt(event.target.value, 10))} className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-sm text-stone-900 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100">
              {tracks.map((track, index) => <option key={`${key}-${track.key}`} value={index}>{track.label}</option>)}
            </select>
          </label>
        ))}
      </div>
      {rangeStatus ? <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">Julat aktif: {rangeStatus}</p> : null}
      <details className="mt-3 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 dark:border-stone-700 dark:bg-stone-800/45">
        <summary className="cursor-pointer text-xs font-medium uppercase tracking-wide text-stone-600 dark:text-stone-300">Ulangan Setiap Ayat</summary>
        <div className="mt-3 space-y-3">
          <button type="button" onClick={onResetRangeRepeatOverrides} className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs text-stone-700 transition hover:bg-stone-100 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-800">Tetapkan Semula Julat Kepada Ulangan Asal</button>
          <div className="grid gap-2 sm:grid-cols-2">
            {tracksInRange.map((track) => (
              <label key={`repeat-${track.key}`} className="text-xs text-stone-600 dark:text-stone-300">
                {track.label}
                <select value={String(repeatByTrack[track.key] ?? defaultRepeatCount)} onChange={(event) => onTrackRepeatCountChange(track.key, normalizeRepeatValue(event.target.value))} className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-sm text-stone-900 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100">
                  {REPEAT_OPTIONS.map((option) => <option key={`${track.key}-${option}`} value={option}>{repeatLabel(option)}</option>)}
                </select>
              </label>
            ))}
          </div>
        </div>
      </details>
      <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">{repeatStatus}</p>
    </>
  );
}
