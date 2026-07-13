import type { ReadAudioTrack } from "../../domain/audio/pageAudioTracks";

export interface ReadAudioDockProps {
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
  onAllTracksEnded?: () => void;
}

export type RangePreset = "page" | "surah" | "juz";
export type RepeatOption = 1 | 2 | 3 | -1;

export interface ReadAudioLoopState {
  safeIndex: number;
  normalizedRangeStart: number;
  normalizedRangeEnd: number;
  repeatEachVerse: RepeatOption;
  repeatSet: RepeatOption;
  repeatEachStep: number;
  repeatSetStep: number;
}

export const RANGE_PRESETS: Array<{ value: RangePreset; label: string }> = [
  { value: "page", label: "Halaman" },
  { value: "surah", label: "Surah" },
  { value: "juz", label: "Juz" },
];

export const RANGE_PRESET_SHORT_LABEL: Record<RangePreset, string> = {
  page: "Hlm",
  surah: "Surah",
  juz: "Juz",
};

export const REPEAT_OPTIONS: RepeatOption[] = [1, 2, 3, -1];
export const SPEED_OPTIONS = [0.75, 1, 1.25, 1.5] as const;

export function speedLabel(rate: number): string {
  return rate === 1 ? "1x" : `${rate}x`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function repeatLabel(value: RepeatOption): string {
  if (value === -1) return "ulang tanpa henti";
  if (value === 1) return "1 kali";
  return `${value} kali`;
}

export function formatTrackLabel(track: ReadAudioTrack): string {
  return `${track.surahId}:${track.ayahNumber}`;
}

export function resolvePresetEndIndex(
  tracks: ReadAudioTrack[],
  startIndex: number,
  preset: RangePreset,
): number {
  if (tracks.length === 0) return 0;
  const safeStartIndex = clamp(startIndex, 0, tracks.length - 1);
  if (preset === "page") return tracks.length - 1;

  const startTrack = tracks[safeStartIndex];
  if (!startTrack) return tracks.length - 1;

  let endIndex = safeStartIndex;
  for (let index = safeStartIndex; index < tracks.length; index += 1) {
    const track = tracks[index];
    if (!track) break;
    const sameScope =
      preset === "surah"
        ? track.surahId === startTrack.surahId
        : track.juzNumber === startTrack.juzNumber;
    if (!sameScope) break;
    endIndex = index;
  }
  return endIndex;
}
