import type { Theme } from "@/shared/types/database";

export interface ThemeAppearanceAyah {
  id: number;
  surah_id: number;
  ayah_number: number;
  text_uthmani: string;
  display_bm: string | null;
  translation_en?: string | null;
  page_number: number;
  theme: Theme | null;
  theme_relevance: "primary" | "secondary" | null;
}

export interface ThemeAppearanceChunk {
  chunk_index: number;
  surah_id: number;
  start_ayah: number;
  end_ayah: number;
  ayah_count: number;
  theme: Theme | null;
  label_bm: string | null;
  label_en: string | null;
  synopsis_bm: string | null;
  source: "auto" | "manual";
  ayat: ThemeAppearanceAyah[];
}

export interface ThemeAppearanceChunkSeed {
  surah_id: number;
  start_ayah: number;
  end_ayah: number;
  ayah_count: number;
  theme: Theme | null;
  label_bm: string | null;
  label_en: string | null;
  synopsis_bm: string | null;
  source: "auto" | "manual";
  ayat: ThemeAppearanceAyah[];
}

export interface ThemeChunkOverride {
  start_ayah: number;
  end_ayah: number;
  theme_id: number | null;
  label_bm: string | null;
  label_en: string | null;
  synopsis_bm: string | null;
}

export interface AyahThemeLinkRow {
  ayah_id: number;
  relevance: "primary" | "secondary" | null;
  theme: Theme | Theme[] | null;
}

export interface AyahThemeBaseRow {
  id: number;
  surah_id: number;
  ayah_number: number;
  text_uthmani: string;
  display_bm: string | null;
  translation_en?: string | null;
  page_number: number;
}

export interface AyahThemeChunkDatasetRow {
  id: number;
  surah_id: number;
  ayah_from: number;
  ayah_to: number;
  theme: string;
  theme_bm: string | null;
}

export interface ThemeChunkContentKey {
  surahId: number;
  startAyah: number;
  endAyah: number;
}
