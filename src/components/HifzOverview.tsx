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
  hasProgress: boolean;
}

export function HifzOverview({
  newCount,
  reviewCount,
  stats,
  juzProgress,
  isGuest,
  hasProgress,
}: HifzOverviewProps) {
  const router = useRouter();
  const [loading, setLoading] = useState<"memorize" | "review" | null>(null);
  const [importPage, setImportPage] = useState("");
  const [importing, setImporting] = useState(false);
  const [importDone, setImportDone] = useState(false);

  const showImport = !isGuest && !hasProgress && !importDone;

  const handleImport = useCallback(async () => {
    const page = parseInt(importPage, 10);
    if (!page || page < 1 || page > 604) return;
    setImporting(true);
    try {
      const res = await fetch("/api/hifz/import-memorized", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ upToPage: page }),
      });
      if (res.ok) {
        setImportDone(true);
        router.refresh();
      }
    } catch {
      // silently fail — user can retry
    } finally {
      setImporting(false);
    }
  }, [importPage, router]);

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
      {/* Import prior memorization */}
      {showImport && (
        <div className="rounded-2xl border border-indigo-200/80 bg-indigo-50/60 p-6 shadow-sm backdrop-blur-sm dark:border-indigo-700/40 dark:bg-indigo-950/40 sm:p-8">
          <h3 className="mb-1 text-lg font-bold text-stone-900 dark:text-stone-100">
            Sudah hafal sebelum ini?
          </h3>
          <p className="mb-4 text-sm text-stone-600 dark:text-stone-400">
            Pilih halaman terakhir yang anda sudah hafal. Kami akan merekodkannya
            supaya anda boleh mula dari halaman seterusnya.
          </p>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <label
                htmlFor="import-page"
                className="text-sm font-medium text-stone-700 dark:text-stone-300"
              >
                Halaman:
              </label>
              <input
                id="import-page"
                type="number"
                min={1}
                max={604}
                value={importPage}
                onChange={(e) => setImportPage(e.target.value)}
                placeholder="cth. 16"
                className="w-24 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100 dark:placeholder:text-stone-500"
              />
              <span className="text-sm text-stone-500 dark:text-stone-400">
                / 604
              </span>
            </div>
            <button
              type="button"
              disabled={importing || !importPage || parseInt(importPage, 10) < 1}
              onClick={handleImport}
              className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-indigo-500 dark:hover:bg-indigo-400"
            >
              {importing ? "Merekod..." : "Rekod Hafalan"}
            </button>
          </div>
        </div>
      )}

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
