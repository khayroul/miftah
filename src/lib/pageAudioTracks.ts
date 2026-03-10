import type { Ayah } from "@/types/database";

export interface ReadAudioTrack {
  key: string;
  label: string;
  audioUrl: string;
  bm: string | null;
  surahId: number;
  ayahNumber: number;
  juzNumber: number;
}

const DEFAULT_EVERYAYAH_BASE_URL = "https://everyayah.com/data";
const DEFAULT_EVERYAYAH_RECITER = "Alafasy_128kbps";

function toThreeDigits(value: number): string {
  return String(value).padStart(3, "0");
}

function buildEveryAyahUrl(surah: number, ayah: number): string {
  const baseUrl =
    process.env.NEXT_PUBLIC_EVERYAYAH_BASE_URL?.trim() ||
    DEFAULT_EVERYAYAH_BASE_URL;
  const reciter =
    process.env.NEXT_PUBLIC_EVERYAYAH_RECITER?.trim() ||
    DEFAULT_EVERYAYAH_RECITER;
  return `${baseUrl}/${reciter}/${toThreeDigits(surah)}${toThreeDigits(ayah)}.mp3`;
}

export function mapAyatToPageAudioTracks(ayat: Ayah[]): ReadAudioTrack[] {
  return ayat
    .map((ayah) => ({
      key: `${ayah.surah_id}:${ayah.ayah_number}`,
      label: `${ayah.surah_id}:${ayah.ayah_number}`,
      audioUrl:
        typeof ayah.audio_url === "string" && ayah.audio_url.length > 0
          ? ayah.audio_url
          : buildEveryAyahUrl(ayah.surah_id, ayah.ayah_number),
      bm: ayah.display_bm,
      surahId: ayah.surah_id,
      ayahNumber: ayah.ayah_number,
      juzNumber: ayah.juz_number,
    }));
}
