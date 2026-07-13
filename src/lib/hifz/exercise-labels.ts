import type { TasmiRatingLabel } from '@/features/tasmi';

export const RATING_LABEL_DISPLAY: Record<TasmiRatingLabel, { text: string; color: string }> = {
  ulang: { text: 'Ulang', color: 'text-red-600 dark:text-red-400' },
  tersangkut: { text: 'Tersangkut', color: 'text-amber-600 dark:text-amber-400' },
  lancar: { text: 'Lancar', color: 'text-teal-600 dark:text-teal-400' },
  mantap: { text: 'Mantap', color: 'text-emerald-600 dark:text-emerald-400' },
};
