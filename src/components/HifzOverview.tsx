"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { JuzHeatmap } from "@/components/JuzHeatmap";
import { saveQueue } from "@/lib/hifz/sessionQueue";
import type {
  HifzFlowType,
  HifzQueueItem,
} from "@/lib/hifz/sessionQueue";
import type { JuzStat, HifzStats } from "@/lib/hifz/stats";

interface HifzQueueResponse {
  items: HifzQueueItem[];
  pageOrder: number[];
}

interface ImportSummary {
  count: number;
  nextPage: number | null;
  queue: HifzQueueResponse | null;
  upToPage: number;
}

interface HifzOverviewProps {
  newCount: number;
  reviewCount: number;
  stats: HifzStats;
  juzProgress: JuzStat[];
  isGuest: boolean;
  hasProgress: boolean;
  canStartFresh?: boolean;
}

export function HifzOverview({
  newCount,
  reviewCount,
  stats,
  juzProgress,
  isGuest,
  hasProgress,
  canStartFresh = false,
}: HifzOverviewProps) {
  const router = useRouter();
  const [loading, setLoading] = useState<"memorize" | "review" | null>(null);
  const [importPage, setImportPage] = useState("");
  const [importing, setImporting] = useState(false);
  const [importDone, setImportDone] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);

  const effectiveHasProgress = hasProgress || importDone || importSummary !== null;
  const effectiveNewCount = importSummary?.queue?.items.length ?? newCount;

  const showImport = !isGuest && !effectiveHasProgress && !importDone;

  const openQueue = useCallback(
    (type: HifzFlowType, queue: HifzQueueResponse) => {
      if (queue.pageOrder.length === 0) {
        return false;
      }

      saveQueue(type, queue.items);
      router.push(`/read/${queue.pageOrder[0]}?flow=${type}&qi=0`);
      return true;
    },
    [router],
  );

  const loadQueue = useCallback(async (type: HifzFlowType) => {
    const res = await fetch(`/api/hifz/queue?type=${type}`);
    if (!res.ok) {
      throw new Error("QUEUE_REQUEST_FAILED");
    }

    return (await res.json()) as HifzQueueResponse;
  }, []);

  const handleImport = useCallback(async () => {
    const page = parseInt(importPage, 10);
    if (!page || page < 1 || page > 604) return;

    setImporting(true);
    setImportError(null);
    setImportSummary(null);

    try {
      const res = await fetch("/api/hifz/import-memorized", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ upToPage: page }),
      });

      const payload = (await res.json()) as { count?: number; error?: string };
      if (!res.ok) {
        setImportError(payload.error ?? "Tak dapat rekod hafalan sedia ada sekarang.");
        return;
      }

      let queue: HifzQueueResponse | null = null;
      if (page < 604) {
        try {
          queue = await loadQueue("memorize");
        } catch {
          queue = null;
        }
      }

      setImportDone(true);
      setImportPage("");
      setImportSummary({
        count: payload.count ?? 0,
        nextPage: queue?.pageOrder[0] ?? (page < 604 ? page + 1 : null),
        queue,
        upToPage: page,
      });
      router.refresh();
    } catch {
      setImportError("Tak dapat rekod hafalan sedia ada sekarang. Cuba sekali lagi.");
    } finally {
      setImporting(false);
    }
  }, [importPage, loadQueue, router]);

  const handleCta = useCallback(
    async (type: "memorize" | "review") => {
      if (isGuest) return;

      if (type === "memorize" && importSummary?.queue) {
        openQueue(type, importSummary.queue);
        return;
      }

      setLoading(type);

      try {
        const data = await loadQueue(type);

        if (data.pageOrder.length === 0) {
          setLoading(null);
          return;
        }

        openQueue(type, data);
      } catch {
        setLoading(null);
      }
    },
    [importSummary?.queue, isGuest, loadQueue, openQueue],
  );

  const hasNew = effectiveNewCount > 0;
  const hasReview = reviewCount > 0;
  const showStartFresh = !isGuest && canStartFresh && !effectiveHasProgress;
  const canOpenMemorizeFlow = hasNew || showStartFresh;
  const importedQueue = importSummary?.queue;

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

      {importError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50/80 px-5 py-4 text-sm text-red-700 shadow-sm dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
          {importError}
        </div>
      ) : null}

      {importSummary ? (
        <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/80 p-6 shadow-sm backdrop-blur-sm dark:border-emerald-700/40 dark:bg-emerald-950/30 sm:p-8">
          <h3 className="text-lg font-bold text-stone-900 dark:text-stone-100">
            Hafalan sedia ada berjaya direkod.
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-stone-600 dark:text-stone-300">
            {importSummary.nextPage
              ? `Halaman 1 hingga ${importSummary.upToPage} ditanda sebagai sudah hafal. Seterusnya anda boleh sambung hafal dari halaman ${importSummary.nextPage}.`
              : `Semua 604 halaman sudah direkod sebagai hafalan sedia ada. Ulangan akan muncul ikut jadual FSRS anda.`}
          </p>
          <p className="mt-2 text-xs uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">
            {importSummary.count} ayat dikemas kini
          </p>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            {importedQueue && importedQueue.pageOrder.length > 0 ? (
              <button
                type="button"
                onClick={() => openQueue("memorize", importedQueue)}
                className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-400"
              >
                Teruskan Hafal di Halaman {importSummary.nextPage}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => router.refresh()}
              className="rounded-xl border border-emerald-300 bg-white/80 px-5 py-3 text-sm font-semibold text-emerald-900 transition hover:bg-white dark:border-emerald-700 dark:bg-stone-900/50 dark:text-emerald-200 dark:hover:bg-stone-900"
            >
              Muat Semula Pelan Hafal
            </button>
          </div>
        </div>
      ) : null}

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
                {effectiveNewCount}
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
            disabled={!canOpenMemorizeFlow || loading !== null || isGuest}
            onClick={() => handleCta("memorize")}
            className="flex-1 rounded-xl px-6 py-3.5 text-base font-semibold shadow-sm transition-all disabled:cursor-not-allowed disabled:opacity-40 bg-amber-500 text-white hover:bg-amber-600 active:bg-amber-700 dark:bg-amber-600 dark:hover:bg-amber-500"
          >
            {loading === "memorize"
              ? "Memuatkan..."
              : showStartFresh
                ? "Mulakan Hafal"
                : "Hafal Baru"}
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
        {showStartFresh && (
          <p className="mt-3 text-center text-sm text-stone-500 dark:text-stone-400">
            Belum ada jadual hafalan. Mula dari awal, atau import hafalan sedia ada dahulu.
          </p>
        )}
      </div>

      {/* Juz heatmap */}
      <JuzHeatmap juzProgress={juzProgress} />
    </div>
  );
}
