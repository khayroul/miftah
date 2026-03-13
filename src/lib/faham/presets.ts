import type { FahamSourceType } from "@/types/database";

export type FahamSourcePreset = "mixed" | "reading" | "theme" | "hifz";

export interface FahamPresetConfig {
  helper: string;
  label: string;
  preferredSources: FahamSourceType[];
  shortLabel: string;
}

export const FAHAM_PRESET_CONFIGS: Record<FahamSourcePreset, FahamPresetConfig> = {
  hifz: {
    helper: "Susun kad baru supaya yang paling rapat dengan ayat hafalan aktif datang dahulu.",
    label: "Hafal dahulu",
    preferredSources: ["hifz_ayah", "reading_page", "theme_chunk"],
    shortLabel: "Hafal",
  },
  mixed: {
    helper: "Campur semua feeder supaya deck kekal seimbang antara baca, tema, dan hafal.",
    label: "Campuran seimbang",
    preferredSources: ["reading_page", "theme_chunk", "hifz_ayah"],
    shortLabel: "Campur",
  },
  reading: {
    helper: "Tolak ke depan perkataan yang baru anda jumpa ketika membaca halaman.",
    label: "Baca dahulu",
    preferredSources: ["reading_page", "theme_chunk", "hifz_ayah"],
    shortLabel: "Baca",
  },
  theme: {
    helper: "Utamakan perkataan yang kuat berulang dalam tema yang sedang diteroka.",
    label: "Tema dahulu",
    preferredSources: ["theme_chunk", "reading_page", "hifz_ayah"],
    shortLabel: "Tema",
  },
};

export function parseFahamSourcePreset(
  value: string | null | undefined,
): FahamSourcePreset {
  if (value === "reading" || value === "theme" || value === "hifz") {
    return value;
  }

  return "mixed";
}
