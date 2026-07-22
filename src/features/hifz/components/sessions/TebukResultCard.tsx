"use client";

import { useTranslations } from "next-intl";
import type { TebukRoundResult } from "../../domain/types";
import { resolveRatingLabelDisplay } from "../../domain/exercise-labels";

interface TebukResultCardProps {
  result: TebukRoundResult;
  roundNumber: number;
  isLastRound: boolean;
  onNext: () => void;
}

export function TebukResultCard({
  result,
  roundNumber,
  isLastRound,
  onNext,
}: TebukResultCardProps) {
  const t = useTranslations("hifz.tebuk");
  const tOverlays = useTranslations("hifz.sessionOverlays");
  const tRatingLabel = useTranslations("hifz.ratingLabel");
  const labelDisplay = resolveRatingLabelDisplay(result.label, tRatingLabel);
  const accuracy = Math.round(result.tasmiResult.accuracy);

  return (
    <div className="rounded-2xl border border-stone-200 bg-white shadow-sm dark:border-stone-700 dark:bg-stone-900">
      {/* Header */}
      <div className="border-b border-stone-100 px-5 py-3 dark:border-stone-800">
        <span className="text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">
          {t("roundLabel", { round: roundNumber })}
        </span>
      </div>

      {/* Result stats */}
      <div className="flex items-center justify-around px-5 py-6">
        <div className="text-center">
          <p className="text-3xl font-bold text-stone-900 dark:text-stone-100">
            {accuracy}%
          </p>
          <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
            {tOverlays("accuracyLabel")}
          </p>
        </div>

        <div className="text-center">
          <p className="text-3xl font-bold text-stone-900 dark:text-stone-100">
            {result.tasmiResult.talqinCount}
          </p>
          <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
            {tOverlays("talqinLabel")}
          </p>
        </div>

        <div className="text-center">
          <p className={`text-xl font-bold ${labelDisplay.color}`}>
            {labelDisplay.text}
          </p>
          <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
            {t("assessmentLabel")}
          </p>
        </div>
      </div>

      {/* Next button */}
      <div className="border-t border-stone-100 px-5 py-4 dark:border-stone-800">
        <button
          type="button"
          onClick={onNext}
          className="w-full rounded-xl bg-teal-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700 active:bg-teal-800"
        >
          {isLastRound ? t("viewResultsCta") : t("nextCta")}
        </button>
      </div>
    </div>
  );
}
