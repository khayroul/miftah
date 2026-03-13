"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { JuzHeatmap } from "@/components/JuzHeatmap";
import { saveQueue } from "@/lib/hifz/sessionQueue";
import type { HifzQueueItem } from "@/lib/hifz/sessionQueue";
import type { JuzStat, HifzStats } from "@/lib/hifz/stats";

interface HifzOverviewProps {
  newCount: number;
  reviewCount: number;
  stats: HifzStats;
  juzProgress: JuzStat[];
  isGuest: boolean;
}

export function HifzOverview({
  newCount,
  reviewCount,
  stats,
  juzProgress,
  isGuest,
}: HifzOverviewProps) {
  const router = useRouter();
  const [loading, setLoading] = useState<"memorize" | "review" | null>(null);

  const handleCta = useCallback(
    async (type: "memorize" | "review") => {
      if (isGuest) return;
      setLoading(type);

      try {
        const res = await fetch(`/api/hifz/queue?type=${type}`);
        if (!res.ok) {
          setLoading(null);
          return;
        }

        const data = (await res.json()) as {
          items: HifzQueueItem[];
          pageOrder: number[];
        };

        if (data.pageOrder.length === 0) {
          setLoading(null);
          return;
        }

        saveQueue(type, data.items);
        const firstPage = data.pageOrder[0];
        router.push(`/read/${firstPage}?flow=${type}&qi=0`);
      } catch {
        setLoading(null);
      }
    },
    [isGuest, router],
  );

  const hasNew = newCount > 0;
  const hasReview = reviewCount > 0;

  return (
    <div className="flex flex-col gap-8">
      {/* Status card */}
      <div className="rounded-2xl border border-stone-200/80 bg-white/80 p-6 shadow-sm backdrop-blur-sm dark:border-stone-700/50 dark:bg-stone-900/60 sm:p-8">
        <h2 className="mb-4 text-2xl font-bold text-stone-900 dark:text-stone-100">
          Hafalan Hari Ini
        </h2>

        {/* Counts */}
        <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-base text-stone-600 dark:text-stone-400">
          {hasNew && (
            <span>
              <span className="font-semibold text-amber-600 dark:text-amber-400">
                {newCount}
              </span>{" "}
              ayat baru
            </span>
          )}
          {hasNew && hasReview && <span aria-hidden="true">&middot;</span>}
          {hasReview && (
            <span>
              <span className="font-semibold text-teal-600 dark:text-teal-400">
                {reviewCount}
              </span>{" "}
              perlu diuji
            </span>
          )}
          {!hasNew && !hasReview && (
            <span className="text-stone-500 dark:text-stone-400">
              Tiada hafalan dijadualkan hari ini.
            </span>
          )}
        </div>

        {/* Streak */}
        {stats.streak > 0 && (
          <p className="mb-6 text-sm text-stone-500 dark:text-stone-400">
            {stats.streak} hari berturut-turut
          </p>
        )}

        {/* CTAs */}
        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            disabled={!hasNew || loading !== null || isGuest}
            onClick={() => handleCta("memorize")}
            className="flex-1 rounded-xl px-6 py-3.5 text-base font-semibold shadow-sm transition-all disabled:cursor-not-allowed disabled:opacity-40 bg-amber-500 text-white hover:bg-amber-600 active:bg-amber-700 dark:bg-amber-600 dark:hover:bg-amber-500"
          >
            {loading === "memorize" ? "Memuatkan..." : "Hafal Baru"}
          </button>

          <button
            type="button"
            disabled={!hasReview || loading !== null || isGuest}
            onClick={() => handleCta("review")}
            className="flex-1 rounded-xl px-6 py-3.5 text-base font-semibold shadow-sm transition-all disabled:cursor-not-allowed disabled:opacity-40 bg-teal-600 text-white hover:bg-teal-700 active:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500"
          >
            {loading === "review" ? "Memuatkan..." : "Uji Hafalan"}
          </button>
        </div>

        {!hasNew && hasReview && (
          <p className="mt-3 text-center text-sm text-stone-400 dark:text-stone-500">
            Tiada ayat baru hari ini
          </p>
        )}
        {hasNew && !hasReview && (
          <p className="mt-3 text-center text-sm text-stone-400 dark:text-stone-500">
            Tiada ulangan hari ini
          </p>
        )}
      </div>

      {/* Juz heatmap */}
      <JuzHeatmap juzProgress={juzProgress} />
    </div>
  );
}
