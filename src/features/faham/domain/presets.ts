import type { FahamSourceType } from "@/shared/types/database";

export type FahamSourcePreset = "mixed" | "reading" | "theme" | "hifz";

export interface FahamPresetConfig {
  preferredSources: FahamSourceType[];
}

// Structural config only (stable ids -> preferredSources). Display strings
// (label/helper/shortLabel) are resolved at render time via
// resolveFahamPresetDisplay() below, since useTranslations() is a hook and
// can't run at module scope. See FahamSourcePicker.tsx for the call site.
export const FAHAM_PRESET_CONFIGS: Record<FahamSourcePreset, FahamPresetConfig> = {
  hifz: {
    preferredSources: ["hifz_ayah", "reading_page", "theme_chunk"],
  },
  mixed: {
    preferredSources: ["reading_page", "theme_chunk", "hifz_ayah"],
  },
  reading: {
    preferredSources: ["reading_page", "theme_chunk", "hifz_ayah"],
  },
  theme: {
    preferredSources: ["theme_chunk", "reading_page", "hifz_ayah"],
  },
};

export type FahamPresetTranslator = (key: string) => string;

export function resolveFahamPresetDisplay(
  preset: FahamSourcePreset,
  t: FahamPresetTranslator,
): { helper: string; label: string; shortLabel: string } {
  return {
    helper: t(`presetHelper.${preset}`),
    label: t(`presetLabel.${preset}`),
    shortLabel: t(`presetShortLabel.${preset}`),
  };
}

export function parseFahamSourcePreset(
  value: string | null | undefined,
): FahamSourcePreset {
  if (value === "reading" || value === "theme" || value === "hifz") {
    return value;
  }

  return "mixed";
}
