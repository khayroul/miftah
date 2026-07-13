import type { TasmiSessionResult } from "../domain/tasmi-session";
import { tasmiResultToLabel, type TasmiRatingLabel } from "../domain/fsrs-bridge";

interface TasmiSessionResultViewProps {
  result: TasmiSessionResult;
  onRetry: () => void;
  onSave: () => void;
}

const LABEL_COLORS: Record<TasmiRatingLabel, string> = {
  ulang: "text-rose-500",
  tersangkut: "text-amber-500",
  lancar: "text-teal-500",
  mantap: "text-emerald-500",
};

const LABEL_TEXT: Record<TasmiRatingLabel, string> = {
  ulang: "Ulang",
  tersangkut: "Tersangkut",
  lancar: "Lancar",
  mantap: "Mantap",
};

export function TasmiSessionResultView({
  result,
  onRetry,
  onSave,
}: TasmiSessionResultViewProps) {
  const label = tasmiResultToLabel(result);

  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl bg-stone-50 p-6 dark:bg-stone-800/50">
      <p className="text-sm font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
        Keputusan Tasmi&apos;
      </p>
      <p className={`text-3xl font-bold ${LABEL_COLORS[label]}`}>
        {LABEL_TEXT[label]}
      </p>
      <div className="flex gap-6 text-center text-sm text-stone-600 dark:text-stone-300">
        <div>
          <p className="text-lg font-bold">{Math.round(result.accuracy)}%</p>
          <p>Ketepatan</p>
        </div>
        <div>
          <p className="text-lg font-bold">{result.wordsCorrect}/{result.totalWords}</p>
          <p>Perkataan</p>
        </div>
        <div>
          <p className="text-lg font-bold">{result.talqinCount}</p>
          <p>Talqin</p>
        </div>
        <div>
          <p className="text-lg font-bold">{Math.round(result.durationSeconds)}s</p>
          <p>Masa</p>
        </div>
      </div>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onSave}
          className="rounded-xl bg-teal-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700"
        >
          Simpan &amp; Teruskan
        </button>
        <button
          type="button"
          onClick={onRetry}
          className="rounded-xl border border-stone-300 bg-white px-5 py-3 text-sm font-medium text-stone-700 transition hover:bg-stone-50 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200"
        >
          Cuba Lagi
        </button>
      </div>
    </div>
  );
}
