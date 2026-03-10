"use client";

import type { JuzStat } from "@/lib/hifz/stats";

interface JuzHeatmapProps {
  juzProgress: JuzStat[];
}

function juzColor(pct: number): string {
  if (pct === 0) return "bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400";
  if (pct < 25) return "bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-300";
  if (pct < 75) return "bg-teal-300 text-teal-900 dark:bg-teal-700 dark:text-teal-100";
  if (pct < 100) return "bg-teal-600 text-white dark:bg-teal-500 dark:text-white";
  return "bg-amber-400 text-white dark:bg-amber-500 dark:text-white";
}

export function JuzHeatmap({ juzProgress }: JuzHeatmapProps) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-stone-500 dark:text-stone-400">
        Kemajuan Juz
      </p>
      <div className="grid grid-cols-6 gap-1.5">
        {juzProgress.map((stat) => (
          <div
            key={stat.juz}
            title={`Juz ${stat.juz}: ${stat.manzilCount} / ${stat.totalAyat} ayat hafal (${stat.manzilPct}%)`}
            className={`flex flex-col items-center justify-center rounded-lg p-1.5 transition-opacity hover:opacity-80 ${juzColor(stat.manzilPct)}`}
          >
            <span className="text-[10px] font-bold leading-none">{stat.juz}</span>
            {stat.manzilPct > 0 && (
              <span className="mt-0.5 text-[9px] leading-none opacity-80">
                {Math.round(stat.manzilPct)}%
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
          Dalam hafazan
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded bg-amber-400 dark:bg-amber-500" />
          Penuh
        </span>
      </div>
    </div>
  );
}
