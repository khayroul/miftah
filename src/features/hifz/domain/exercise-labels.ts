import type { TasmiRatingLabel } from '@/features/tasmi';

const RATING_LABEL_COLOR: Record<TasmiRatingLabel, string> = {
  ulang: 'text-red-600 dark:text-red-400',
  tersangkut: 'text-amber-600 dark:text-amber-400',
  lancar: 'text-teal-600 dark:text-teal-400',
  mantap: 'text-emerald-600 dark:text-emerald-400',
};

export type RatingLabelTranslator = (key: TasmiRatingLabel) => string;

/**
 * Resolves the display text + color for a Tasmi' rating label at render
 * time. Text is locale-dependent (resolved via the `hifz.ratingLabel.*`
 * translation keys); color is a static Tailwind class, not translatable.
 * Mirrors the `resolveMcqLabels` render-time pattern in FahamStudyCard.tsx.
 */
export function resolveRatingLabelDisplay(
  label: TasmiRatingLabel,
  t: RatingLabelTranslator,
): { text: string; color: string } {
  return { text: t(label), color: RATING_LABEL_COLOR[label] };
}
