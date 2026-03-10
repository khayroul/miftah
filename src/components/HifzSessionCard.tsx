"use client";

import type { PlanItem } from "@/lib/hifz/scheduler";
import type { FsrsRating } from "@/types/database";

interface HifzSessionCardProps {
  item: PlanItem;
  block: "sabqi" | "sabak" | "manzil";
  index: number;
  total: number;
  isLoading: boolean;
  onRate: (rating: FsrsRating) => void;
}

const BLOCK_LABELS: Record<string, string> = {
  sabqi: "SABQI",
  sabak: "SABAK",
  manzil: "MANZIL",
};

const BLOCK_COLORS: Record<string, string> = {
  sabqi: "border-teal-900/15 bg-teal-950/5 text-teal-900/80 dark:border-teal-300/20 dark:bg-teal-900/40 dark:text-teal-100",
  sabak: "border-amber-900/15 bg-amber-950/5 text-amber-900/80 dark:border-amber-300/20 dark:bg-amber-900/40 dark:text-amber-100",
  manzil: "border-indigo-900/15 bg-indigo-950/5 text-indigo-900/80 dark:border-indigo-300/20 dark:bg-indigo-900/40 dark:text-indigo-100",
};

const RATINGS: { rating: FsrsRating; labelBm: string; color: string }[] = [
  {
    rating: 1,
    labelBm: "Lupa",
    color:
      "border-red-200 bg-red-50 text-red-800 hover:bg-red-100 dark:border-red-800/40 dark:bg-red-900/20 dark:text-red-300 dark:hover:bg-red-900/40",
  },
  {
    rating: 2,
    labelBm: "Susah",
    color:
      "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-700/40 dark:bg-amber-900/20 dark:text-amber-300 dark:hover:bg-amber-900/40",
  },
  {
    rating: 3,
    labelBm: "Hafal",
    color:
      "border-teal-300 bg-teal-900 text-teal-50 hover:bg-teal-800 dark:border-teal-600 dark:bg-teal-700 dark:text-teal-50 dark:hover:bg-teal-600",
  },
  {
    rating: 4,
    labelBm: "Mudah",
    color:
      "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-700/40 dark:bg-emerald-900/20 dark:text-emerald-300 dark:hover:bg-emerald-900/40",
  },
];

export function HifzSessionCard({
  item,
  block,
  index,
  total,
  isLoading,
  onRate,
}: HifzSessionCardProps) {
  const { ayah } = item;

  return (
    <div className="animate-fade-in-up rounded-3xl border border-stone-200/90 bg-white/85 p-5 shadow-[0_25px_70px_-48px_rgba(28,25,23,0.55)] backdrop-blur-sm sm:p-7 dark:border-stone-700 dark:bg-stone-900/78 dark:shadow-[0_25px_70px_-48px_rgba(2,6,23,0.9)]">
      {/* Header: block badge + progress */}
      <div className="mb-5 flex items-center justify-between">
        <span
          className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium tracking-wide ${BLOCK_COLORS[block]}`}
        >
          {BLOCK_LABELS[block]}
        </span>
        <span className="text-xs text-stone-500 dark:text-stone-400">
          {index + 1} / {total}
        </span>
      </div>

      {/* Surah + ayah ref */}
      <p className="mb-3 text-xs font-medium tracking-wide text-stone-500 dark:text-stone-400">
        {ayah.surahNameTranslit} · {ayah.surahId}:{ayah.ayahNumber}
      </p>

      {/* Arabic text */}
      <p
        dir="rtl"
        className="font-arabic mb-4 text-right text-2xl leading-loose text-stone-900 sm:text-3xl dark:text-stone-100"
      >
        {ayah.textUthmani}
      </p>

      {/* BM translation */}
      {ayah.displayBm ? (
        <p className="mb-6 text-sm leading-relaxed text-stone-600 dark:text-stone-300">
          {ayah.displayBm}
        </p>
      ) : null}

      {/* Rating buttons */}
      <div className="grid grid-cols-4 gap-2">
        {RATINGS.map(({ rating, labelBm, color }) => (
          <button
            key={rating}
            type="button"
            disabled={isLoading}
            onClick={() => onRate(rating)}
            className={`rounded-xl border px-2 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${color}`}
          >
            {isLoading ? (
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              labelBm
            )}
          </button>
        ))}
      </div>

      {/* Rating hint */}
      <p className="mt-3 text-center text-[11px] text-stone-400 dark:text-stone-500">
        Lupa · Susah · Hafal · Mudah
      </p>
    </div>
  );
}
