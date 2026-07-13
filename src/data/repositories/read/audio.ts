import { supabaseBrowser } from "@/data/supabase/browser";

export interface ExpandedAudioAyah {
  surahId: number;
  ayahNumber: number;
  juzNumber: number;
  audioUrl: string | null;
  displayBm: string | null;
}

export interface ExpandedAudioTrack {
  key: string;
  label: string;
  audioUrl: string;
  bm: string | null;
  surahId: number;
  ayahNumber: number;
  juzNumber: number;
}

interface ExpandedAudioAyahRow {
  surah_id: number;
  ayah_number: number;
  juz_number: number;
  audio_url: string | null;
  display_bm: string | null;
}

const EXPANDED_AUDIO_COLUMNS =
  "surah_id,ayah_number,juz_number,audio_url,display_bm";
const DEFAULT_EVERYAYAH_BASE_URL = "https://everyayah.com/data";
const DEFAULT_EVERYAYAH_RECITER = "Alafasy_128kbps";

function toExpandedAudioAyah(row: ExpandedAudioAyahRow): ExpandedAudioAyah {
  return {
    surahId: row.surah_id,
    ayahNumber: row.ayah_number,
    juzNumber: row.juz_number,
    audioUrl: row.audio_url,
    displayBm: row.display_bm,
  };
}

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

export function mapExpandedAudioAyatToTracks(
  ayat: ExpandedAudioAyah[],
): ExpandedAudioTrack[] {
  return ayat.map((ayah) => ({
    key: `${ayah.surahId}:${ayah.ayahNumber}`,
    label: `${ayah.surahId}:${ayah.ayahNumber}`,
    audioUrl:
      typeof ayah.audioUrl === "string" && ayah.audioUrl.length > 0
        ? ayah.audioUrl
        : buildEveryAyahUrl(ayah.surahId, ayah.ayahNumber),
    bm: ayah.displayBm,
    surahId: ayah.surahId,
    ayahNumber: ayah.ayahNumber,
    juzNumber: ayah.juzNumber,
  }));
}

export async function getExpandedSurahAudioAyat(
  surahId: number,
): Promise<ExpandedAudioAyah[]> {
  const { data, error } = await supabaseBrowser
    .from("ayat")
    .select(EXPANDED_AUDIO_COLUMNS)
    .eq("surah_id", surahId)
    .order("ayah_number");

  if (error) {
    throw error;
  }

  return (data ?? []).map(toExpandedAudioAyah);
}

export async function getExpandedJuzAudioAyat(
  juzNumber: number,
): Promise<ExpandedAudioAyah[]> {
  const { data, error } = await supabaseBrowser
    .from("ayat")
    .select(EXPANDED_AUDIO_COLUMNS)
    .eq("juz_number", juzNumber)
    .order("surah_id")
    .order("ayah_number");

  if (error) {
    throw error;
  }

  return (data ?? []).map(toExpandedAudioAyah);
}

export async function fetchSurahAudioTracks(
  surahId: number,
): Promise<ExpandedAudioTrack[]> {
  try {
    return mapExpandedAudioAyatToTracks(
      await getExpandedSurahAudioAyat(surahId),
    );
  } catch (error) {
    console.error("Failed to fetch surah ayat for audio:", error);
    return [];
  }
}

export async function fetchJuzAudioTracks(
  juzNumber: number,
): Promise<ExpandedAudioTrack[]> {
  try {
    return mapExpandedAudioAyatToTracks(
      await getExpandedJuzAudioAyat(juzNumber),
    );
  } catch (error) {
    console.error("Failed to fetch juz ayat for audio:", error);
    return [];
  }
}
