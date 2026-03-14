import type { ReadAudioTrack } from "@/lib/pageAudioTracks";

export interface ReadAudioStartSelection {
  currentIndex: number;
  rangeStartIndex: number;
  rangeEndIndex: number;
}

export function resolveReadAudioPageStartFromAyah(
  tracks: ReadAudioTrack[],
  ayahKey: string,
): ReadAudioStartSelection | null {
  const startIndex = tracks.findIndex((track) => track.key === ayahKey);
  if (startIndex < 0) {
    return null;
  }

  return {
    currentIndex: startIndex,
    rangeStartIndex: startIndex,
    rangeEndIndex: Math.max(tracks.length - 1, startIndex),
  };
}
