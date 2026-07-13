import type { TasmiRatingLabel, TasmiSessionResult } from "@/features/tasmi";
import type { FsrsRating } from "@/types/database";
import { RATING_LABEL_DISPLAY } from "../../domain/exercise-labels";

interface UnveilResultCardProps {
  result: TasmiSessionResult;
  label: TasmiRatingLabel;
  ayahRatings: Array<{
    ayahKey: string;
    rating: FsrsRating;
    label: TasmiRatingLabel;
  }>;
  pageNumber: number;
  onDone: () => void;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function UnveilResultCard({
  result,
  label,
  ayahRatings,
  pageNumber,
  onDone,
}: UnveilResultCardProps) {
  const display = RATING_LABEL_DISPLAY[label];
  const accuracyRounded = Math.round(result.accuracy);

  return (
    <div className="mx-4 w-full max-w-sm rounded-2xl border border-stone-200 bg-white shadow-sm dark:border-stone-700 dark:bg-stone-900">
      {/* Header */}
      <div className="border-b border-stone-100 px-6 py-4 dark:border-stone-800">
        <p className="text-xs font-medium uppercase tracking-wide text-stone-400 dark:text-stone-500">
          Buka Tabir · Halaman {pageNumber}
        </p>
        <p className={`mt-1 text-xl font-bold ${display.color}`}>
          {display.text}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 divide-x divide-stone-100 px-0 dark:divide-stone-800">
        <div className="px-4 py-3 text-center">
          <p className="text-lg font-bold text-stone-900 dark:text-stone-100">
            {accuracyRounded}%
          </p>
          <p className="text-xs text-stone-500 dark:text-stone-400">Ketepatan</p>
        </div>
        <div className="px-4 py-3 text-center">
          <p className="text-lg font-bold text-stone-900 dark:text-stone-100">
            {result.talqinCount}
          </p>
          <p className="text-xs text-stone-500 dark:text-stone-400">Talqin</p>
        </div>
        <div className="px-4 py-3 text-center">
          <p className="text-lg font-bold text-stone-900 dark:text-stone-100">
            {formatDuration(result.durationSeconds)}
          </p>
          <p className="text-xs text-stone-500 dark:text-stone-400">Masa</p>
        </div>
      </div>

      {/* Per-ayah breakdown */}
      {ayahRatings.length > 0 && (
        <div className="border-t border-stone-100 px-6 py-3 dark:border-stone-800">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-stone-400 dark:text-stone-500">
            Per Ayat
          </p>
          <ul className="space-y-1">
            {ayahRatings.map(({ ayahKey, label: ayahLabel }) => {
              const ayahDisplay = RATING_LABEL_DISPLAY[ayahLabel];
              return (
                <li
                  key={ayahKey}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="font-mono text-stone-600 dark:text-stone-300">
                    {ayahKey}
                  </span>
                  <span className={`font-semibold ${ayahDisplay.color}`}>
                    {ayahDisplay.text}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Done button */}
      <div className="border-t border-stone-100 px-6 py-4 dark:border-stone-800">
        <button
          type="button"
          onClick={onDone}
          className="w-full rounded-xl bg-teal-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700 dark:bg-teal-600 dark:hover:bg-teal-500"
        >
          Selesai
        </button>
      </div>
    </div>
  );
}
