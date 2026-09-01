"use client";

import { useTranslations } from "next-intl";

interface ThemeActionPanelProps {
  rangeLabel: string;
  sourceLabel: string;
  synopsis: string;
}

export function ThemeActionPanel({
  rangeLabel,
  sourceLabel,
  synopsis,
}: ThemeActionPanelProps) {
  const t = useTranslations("tema.actionPanel");
  return (
    <section className="rounded-[1.9rem] border border-stone-200/85 bg-[linear-gradient(135deg,rgba(248,250,252,0.92),rgba(255,255,255,0.98))] p-5 shadow-[0_28px_80px_-52px_rgba(28,25,23,0.24)] dark:border-stone-700/80 dark:bg-[linear-gradient(135deg,rgba(41,37,36,0.74),rgba(12,10,9,0.92))] sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <h3 className="text-xl font-medium tracking-tight text-stone-900 dark:text-stone-50">
            {t("synopsisTitle")}
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-stone-600 dark:text-stone-300">
            {synopsis}
          </p>
        </div>

        <div className="flex flex-col items-start gap-2 sm:items-end">
          <span className="rounded-full border border-stone-300/80 bg-white/80 px-3 py-1 text-sm text-stone-700 dark:border-stone-600 dark:bg-stone-900/70 dark:text-stone-200">
            {t("verseRangeLabel", { range: rangeLabel })}
          </span>
          <span className="text-xs font-medium uppercase tracking-[0.18em] text-stone-500 dark:text-stone-400">
            {t("sourceLabel", { source: sourceLabel })}
          </span>
        </div>
      </div>
    </section>
  );
}
