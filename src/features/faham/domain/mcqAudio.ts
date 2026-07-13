import { getQuranWordAudioUrl } from "@/lib/quranWordAudio";
import type { WordWithOccurrences } from "./types";
import type { FahamMcqPoolWord } from "./mcqTypes";

function getDirectAudioKey(word: WordWithOccurrences): string | null {
  const occs = word.word_occurrences;
  const occ = Array.isArray(occs) ? occs[0] : occs;
  if (!occ) return null;
  const ayahValue = (occ as { ayat?: unknown; ayats?: unknown }).ayat
    ?? (occ as { ayat?: unknown; ayats?: unknown }).ayats;
  const ayah = Array.isArray(ayahValue) ? ayahValue[0] : ayahValue;
  if (!ayah) return null;
  const normalizedAyah = ayah as { surah_id?: number; ayah_number?: number };
  if (!normalizedAyah.surah_id || !normalizedAyah.ayah_number) return null;
  return `${normalizedAyah.surah_id}:${normalizedAyah.ayah_number}:${occ.position}`;
}

function normalizeArabicAudioLookup(value: string | null | undefined): string {
  if (!value) {
    return "";
  }

  return value
    .normalize("NFKD")
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, "")
    .replace(/ٱ/g, "ا")
    .replace(/ـ/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getFallbackAudioKey(
  word: WordWithOccurrences,
  pool: FahamMcqPoolWord[],
): string | null {
  const normalizedSimple = word.text_simple.trim();
  if (normalizedSimple.length > 0) {
    const bySimple = pool.find(
      (candidate) =>
        candidate.audioKey &&
        candidate.textSimple.trim() === normalizedSimple,
    );
    if (bySimple?.audioKey) {
      return bySimple.audioKey;
    }
  }

  const normalizedArabic = normalizeArabicAudioLookup(word.text_uthmani);
  if (!normalizedArabic) {
    return null;
  }

  const byUthmani = pool.find(
    (candidate) =>
      candidate.audioKey &&
      normalizeArabicAudioLookup(candidate.textUthmani) === normalizedArabic,
  );
  return byUthmani?.audioKey ?? null;
}

export function getAudioKey(
  word: WordWithOccurrences,
  pool: FahamMcqPoolWord[],
): string | null {
  return getDirectAudioKey(word) ?? getFallbackAudioKey(word, pool);
}

export function getAudioUrlForKey(key: string | null): string | null {
  if (!key) return null;
  const parts = key.split(":").map(Number);
  if (parts.length !== 3) return null;
  return getQuranWordAudioUrl(parts[0], parts[1], parts[2]);
}

export function getMalayAudioUrl(text: string): string {
  // Faham uses a male Malay guide voice to keep prompts sounding consistent.
  // v=2 busts browser cache from prior female Google TTS responses.
  return `/api/audio/tts?text=${encodeURIComponent(text)}&lang=ms&voice=male&v=2`;
}
