import type { FahamMcqDirectionMode } from "../domain/mcq";

// Stable id list only — display strings (label/helper/shortLabel) are
// resolved at render time via resolveFahamDirectionDisplay() below, since
// useTranslations() is a hook and can't run at module scope. Nothing besides
// FahamSourcePicker.tsx consumes this (no structural/non-display field), so
// unlike FAHAM_PRESET_CONFIGS / CORRECT_ADVANCE_CONFIGS there is no
// remaining structural payload to keep.
export const FAHAM_MCQ_DIRECTION_MODES: FahamMcqDirectionMode[] = [
  "arab_to_bm",
  "bm_to_arab",
  "mixed",
];

export type FahamDirectionTranslator = (key: string) => string;

export function resolveFahamDirectionDisplay(
  mode: FahamMcqDirectionMode,
  t: FahamDirectionTranslator,
): { helper: string; label: string; shortLabel: string } {
  return {
    helper: t(`directionHelper.${mode}`),
    label: t(`directionLabel.${mode}`),
    shortLabel: t(`directionShortLabel.${mode}`),
  };
}

export type FahamCorrectAdvanceMode = "fast" | "normal" | "pause";

// Structural config only (stable ids -> delayMs, consumed by
// useFahamSessionController.ts). Display strings move to
// resolveFahamCorrectAdvanceDisplay() below for the same render-time-hook
// reason as FAHAM_PRESET_CONFIGS above.
export const CORRECT_ADVANCE_CONFIGS: Record<
  FahamCorrectAdvanceMode,
  { delayMs: number | null }
> = {
  fast: {
    delayMs: 1000,
  },
  normal: {
    delayMs: 3000,
  },
  pause: {
    delayMs: null,
  },
};

export type FahamCorrectAdvanceTranslator = (key: string) => string;

export function resolveFahamCorrectAdvanceDisplay(
  mode: FahamCorrectAdvanceMode,
  t: FahamCorrectAdvanceTranslator,
): { helper: string; label: string; shortLabel: string } {
  return {
    helper: t(`paceHelper.${mode}`),
    label: t(`paceLabel.${mode}`),
    shortLabel: t(`paceShortLabel.${mode}`),
  };
}
