"use client";

import { useTranslations } from "next-intl";
import type { TebukRoundResult } from "../../domain/types";
import type { TasmiRatingLabel } from "@/features/tasmi";
import { resolveRatingLabelDisplay } from "../../domain/exercise-labels";

interface TebukSessionSummaryProps {
  rounds: TebukRoundResult[];
  aggregateLabel: TasmiRatingLabel;
  pageNumber: number;
  onDone: () => void;
}

export function TebukSessionSummary({
  rounds,
  aggregateLabel,
  pageNumber,
  onDone,
}: TebukSessionSummaryProps) {
  const t = useTranslations("hifz.tebuk");
  const tOverlays = useTranslations("hifz.sessionOverlays");
  const tRatingLabel = useTranslations("hifz.ratingLabel");
  const aggregateDisplay = resolveRatingLabelDisplay(aggregateLabel, tRatingLabel);

  return (
    <div className="rounded-2xl border border-stone-200 bg-white shadow-sm dark:border-stone-700 dark:bg-stone-900">
      {/* Header */}
      <div className="border-b border-stone-100 px-5 py-4 dark:border-stone-800">
        <h2 className="text-base font-semibold text-stone-900 dark:text-stone-100">
          {t("summaryHeading", { page: pageNumber })}
        </h2>
      </div>

      {/* Aggregate label */}
      <div className="flex flex-col items-center px-5 py-6">
        <p className="text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">
          {t("overallResultLabel")}
        </p>
        <p className={`mt-2 text-4xl font-bold ${aggregateDisplay.color}`}>
          {aggregateDisplay.text}
        </p>
      </div>

      {/* Per-round breakdown */}
      <div className="border-t border-stone-100 px-5 py-4 dark:border-stone-800">
        <p className="mb-3 text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">
          {t("roundBreakdownLabel")}
        </p>
        <div className="flex flex-col gap-2">
          {rounds.map((round, index) => {
            const display = resolveRatingLabelDisplay(round.label, tRatingLabel);
            const accuracy = Math.round(round.tasmiResult.accuracy);
            return (
              <div
                key={index}
                className="flex items-center justify-between rounded-xl bg-stone-50 px-4 py-3 dark:bg-stone-800/50"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-stone-200 text-xs font-semibold text-stone-700 dark:bg-stone-700 dark:text-stone-200">
                    {index + 1}
                  </span>
                  <span className="text-sm text-stone-700 dark:text-stone-300">
                    {t("roundSurahAyah", { surah: round.prompt.surah, ayah: round.prompt.ayah })}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-stone-600 dark:text-stone-400">
                    {accuracy}%
                  </span>
                  <span className={`text-sm font-semibold ${display.color}`}>
                    {display.text}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Done button */}
      <div className="border-t border-stone-100 px-5 py-4 dark:border-stone-800">
        <button
          type="button"
          onClick={onDone}
          className="w-full rounded-xl bg-teal-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700 active:bg-teal-800"
        >
          {tOverlays("done")}
        </button>
      </div>
    </div>
  );
}
