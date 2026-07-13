"use client";

import type { JuzStat } from "../domain/types";

interface JuzHeatmapProps {
  juzProgress: JuzStat[];
}

function juzColor(stat: JuzStat): string {
  if (stat.manzilPages <= 0) {
    return "bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400";
  }

  if (stat.manzilPagePct < 25) {
    return "bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-300";
  }
  if (stat.manzilPagePct < 75) {
    return "bg-teal-300 text-teal-900 dark:bg-teal-700 dark:text-teal-100";
  }
  return "bg-teal-600 text-white dark:bg-teal-500 dark:text-white";
}

const TOTAL_QURAN_PAGES = 604;

export function JuzHeatmap({ juzProgress }: JuzHeatmapProps) {
  const totalManzilPages = juzProgress.reduce((sum, stat) => sum + stat.manzilPages, 0);
  const overallPct = (totalManzilPages / TOTAL_QURAN_PAGES) * 100;

  return (
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-stone-500 dark:text-stone-400">
        Kemajuan Juz
      </p>
      <div className="mb-3">
        <div className="h-2 w-full overflow-hidden rounded-full bg-stone-200 dark:bg-stone-700">
          <div
            className="h-full rounded-full bg-teal-600 transition-all dark:bg-teal-500"
            style={{ width: `${Math.max(0, Math.min(overallPct, 100))}%` }}
          />
        </div>
        <p className="mt-1 text-[10px] text-stone-500 dark:text-stone-400">
          {Math.round(overallPct)}% liputan halaman manzil
        </p>
      </div>
      <div className="grid grid-cols-6 gap-1.5">
        {juzProgress.map((stat) => (
          <div
            key={stat.juz}
            title={`Juz ${stat.juz}: ${Math.round(stat.manzilPagePct)}% liputan halaman manzil`}
            className={`flex flex-col items-center justify-center rounded-lg p-1.5 transition-opacity hover:opacity-80 ${juzColor(stat)}`}
          >
            <span className="text-[10px] font-bold leading-none">{stat.juz}</span>
            {stat.manzilPages > 0 && (
              <span className="mt-0.5 text-[9px] leading-none opacity-80">
                {Math.round(stat.manzilPagePct)}%
              </span>
            )}
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-3 text-[10px] text-stone-400 dark:text-stone-500">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded bg-stone-200 dark:bg-stone-700" />
          Belum mula
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded bg-teal-300 dark:bg-teal-700" />
          Ada manzil
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded bg-teal-600 dark:bg-teal-500" />
          Manzil tinggi
        </span>
      </div>
    </div>
  );
}
