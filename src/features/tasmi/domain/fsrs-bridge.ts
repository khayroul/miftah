/**
 * Map tasmi' results to FSRS review ratings.
 * Uses Miftah's existing rating labels: Ulang / Tersangkut / Lancar / Mantap
 */

import type { TasmiSessionResult } from './tasmi-session';
import type { FsrsRating } from '@/shared/types/database';

/** BM labels for tasmi' FSRS mapping */
export type TasmiRatingLabel = 'ulang' | 'tersangkut' | 'lancar' | 'mantap';

/** Map BM label to FSRS numeric rating (1=Again, 2=Hard, 3=Good, 4=Easy) */
const LABEL_TO_RATING: Record<TasmiRatingLabel, FsrsRating> = {
  ulang: 1,
  tersangkut: 2,
  lancar: 3,
  mantap: 4,
};

export function tasmiResultToLabel(result: TasmiSessionResult): TasmiRatingLabel {
  const { accuracy, talqinCount, totalWords } = result;

  // Scaling: adjust thresholds based on passage length
  const talqinRatio = totalWords > 0 ? talqinCount / totalWords : 1;

  if (accuracy < 50 || talqinRatio > 0.3) {
    return 'ulang';       // Need to re-memorize
  } else if (accuracy < 80 || talqinRatio > 0.1) {
    return 'tersangkut';  // Stuck — needs more review
  } else if (accuracy < 95) {
    return 'lancar';      // Smooth but not perfect
  } else {
    return 'mantap';      // Solid — extend interval
  }
}

export function tasmiResultToFsrsRating(result: TasmiSessionResult): FsrsRating {
  return LABEL_TO_RATING[tasmiResultToLabel(result)];
}

/**
 * For per-ayah granularity, identify which specific ayahs had errors.
 * These ayahs get lower FSRS ratings while clean ayahs get boosted.
 */
export function getPerAyahRatings(
  result: TasmiSessionResult,
  ayahWordRanges: Array<{ ayah: number; startWordIndex: number; endWordIndex: number }>,
): Array<{ ayah: number; rating: FsrsRating; label: TasmiRatingLabel }> {
  return ayahWordRanges.map(({ ayah, startWordIndex, endWordIndex }) => {
    const ayahErrors = result.errorPositions.filter(
      pos => pos >= startWordIndex && pos <= endWordIndex
    );
    const ayahWordCount = endWordIndex - startWordIndex + 1;
    const ayahAccuracy = ((ayahWordCount - ayahErrors.length) / ayahWordCount) * 100;

    let label: TasmiRatingLabel;
    if (ayahAccuracy < 50) label = 'ulang';
    else if (ayahAccuracy < 80) label = 'tersangkut';
    else if (ayahAccuracy < 95) label = 'lancar';
    else label = 'mantap';

    return { ayah, rating: LABEL_TO_RATING[label], label };
  });
}
