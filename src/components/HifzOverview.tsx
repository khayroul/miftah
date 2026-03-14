"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { JuzHeatmap } from "@/components/JuzHeatmap";
import { saveQueue } from "@/lib/hifz/sessionQueue";
import type {
  HifzFlowType,
  HifzQueueItem,
} from "@/lib/hifz/sessionQueue";
import type { HifzQueueResponse } from "@/lib/hifz/queue";
import type { JuzStat, HifzStats } from "@/lib/hifz/stats";

interface ImportSummary {
  count: number;
  juzProgress: JuzStat[];
  newPages: number;
  nextPage: number | null;
  queue: HifzQueueResponse | null;
  reviewPages: number;
  stats: HifzStats;
  upToPage: number;
}

interface ImportResponse extends ImportSummary {
  error?: string;
}

interface HifzOverviewProps {
  newPages: number;
  reviewPages: number;
  stats: HifzStats;
  globalStreak?: number;
  juzProgress: JuzStat[];
  isGuest: boolean;
  hasProgress: boolean;
  canStartFresh?: boolean;
}

type EntryPath = "fresh" | "import" | "test";

interface PendingJourney {
  actionLabel: string;
  helperText: string;
  pageNumber: number;
}

function isValidPageNumber(pageValue: string): boolean {
  const page = Number.parseInt(pageValue, 10);
  return Number.isInteger(page) && page >= 1 && page <= 604;
}

export function HifzOverview({
  newPages,
  reviewPages,
  stats,
  globalStreak,
  juzProgress,
  isGuest,
  hasProgress,
  canStartFresh = false,
}: HifzOverviewProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [loading, setLoading] = useState<"memorize" | "review" | null>(null);
  const [entryPath, setEntryPath] = useState<EntryPath>("fresh");
  const [importPage, setImportPage] = useState("");
  const [testPage, setTestPage] = useState("");
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  const [pendingJourney, setPendingJourney] = useState<PendingJourney | null>(null);

  const effectiveStats = importSummary?.stats ?? stats;
  const effectiveGlobalStreak = globalStreak ?? effectiveStats.streak;
  const effectiveJuzProgress = importSummary?.juzProgress ?? juzProgress;
  const effectiveNewPages = importSummary?.newPages ?? newPages;
  const effectiveReviewPages = importSummary?.reviewPages ?? reviewPages;

  const effectiveHasProgress = useMemo(
    () =>
      hasProgress ||
      importSummary !== null ||
      effectiveStats.totalManzilPages > 0 ||
      effectiveNewPages > 0 ||
      effectiveReviewPages > 0,
    [
      effectiveNewPages,
      effectiveReviewPages,
      effectiveStats.totalManzilPages,
      hasProgress,
      importSummary,
    ],
  );

  const openReadPage = useCallback(
    (
      destination: PendingJourney,
      href: string,
      queueToSave?: { type: HifzFlowType; items: HifzQueueItem[] },
    ) => {
      if (queueToSave) {
        saveQueue(queueToSave.type, queueToSave.items);
      }

      setPendingJourney(destination);
      startTransition(() => {
        router.push(href);
      });
    },
    [router, startTransition],
  );

  const openQueue = useCallback(
    (type: HifzFlowType, queue: HifzQueueResponse) => {
      if (queue.pageOrder.length === 0) {
        return false;
      }

      const pageNumber = queue.pageOrder[0];
      openReadPage(
        {
          actionLabel:
            type === "memorize" ? "Membuka sesi hafal" : "Membuka sesi uji hafalan",
          helperText:
            type === "memorize"
              ? "Kami sedang sediakan halaman pertama untuk sesi baru anda."
              : "Kami sedang sediakan halaman pertama untuk ulangan hari ini.",
          pageNumber,
        },
        `/read/${pageNumber}?flow=${type}&qi=0`,
        { type, items: queue.items },
      );
      return true;
    },
    [openReadPage],
  );

  const loadQueue = useCallback(async (type: HifzFlowType) => {
    const res = await fetch(`/api/hifz/queue?type=${type}`, {
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error("QUEUE_REQUEST_FAILED");
    }

    return (await res.json()) as HifzQueueResponse;
  }, []);

  const handleImport = useCallback(async () => {
    const page = Number.parseInt(importPage, 10);
    if (!Number.isInteger(page) || page < 1 || page > 604) {
      setImportError("Masukkan nombor halaman antara 1 hingga 604.");
      return;
    }

    setImporting(true);
    setImportError(null);
    setQueueError(null);
    setTestError(null);
    setImportSummary(null);

    try {
      const res = await fetch("/api/hifz/import-memorized", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ upToPage: page }),
      });

      const payload = (await res.json()) as ImportResponse;
      if (!res.ok) {
        setImportError(payload.error ?? "Tak dapat rekod hafalan sedia ada sekarang.");
        return;
      }

      setImportPage("");
      setImportSummary({
        count: payload.count,
        juzProgress: payload.juzProgress,
        newPages: payload.newPages,
        nextPage: payload.nextPage,
        queue: payload.queue,
        reviewPages: payload.reviewPages,
        stats: payload.stats,
        upToPage: payload.upToPage,
      });

      startTransition(() => {
        router.refresh();
      });
    } catch {
      setImportError("Tak dapat rekod hafalan sedia ada sekarang. Cuba sekali lagi.");
    } finally {
      setImporting(false);
    }
  }, [importPage, router, startTransition]);

  const handleTestExisting = useCallback(() => {
    const page = Number.parseInt(testPage, 10);
    if (!Number.isInteger(page) || page < 1 || page > 604) {
      setTestError("Pilih halaman antara 1 hingga 604 untuk diuji.");
      return;
    }

    setQueueError(null);
    setImportError(null);
    setTestError(null);

    openReadPage(
      {
        actionLabel: "Membuka mod tasmi'",
        helperText: "Mushaf akan dibuka dengan petunjuk kata pembuka untuk bantu anda menguji hafalan sedia ada.",
        pageNumber: page,
      },
      `/read/${page}?mode=hifz&from=hifz&intent=test&cue=first-word`,
    );
  }, [openReadPage, testPage]);

  const handleCta = useCallback(
    async (type: "memorize" | "review") => {
      if (isGuest) {
        return;
      }

      setQueueError(null);
      setImportError(null);
      setTestError(null);

      if (type === "memorize" && importSummary?.queue) {
        if (!openQueue(type, importSummary.queue)) {
          setQueueError("Pelan hafal anda belum siap lagi. Cuba muat semula dan buka sekali lagi.");
        }
        return;
      }

      setLoading(type);

      try {
        const data = await loadQueue(type);

        if (data.pageOrder.length === 0) {
          setQueueError(
            type === "memorize"
              ? "Belum ada halaman baru untuk dibuka. Cuba pilih “Saya belum mula” atau import hafalan sedia ada dahulu."
              : "Belum ada ulangan dijadualkan hari ini. Bila ada, butang ini akan terus buka sesi ujian.",
          );
          setLoading(null);
          return;
        }

        if (!openQueue(type, data)) {
          setQueueError("Tak dapat buka sesi sekarang. Cuba sekali lagi.");
          setLoading(null);
        }
      } catch {
        setQueueError(
          type === "memorize"
            ? "Tak dapat buka sesi hafal sekarang. Semak sambungan dan cuba lagi."
            : "Tak dapat buka sesi uji hafalan sekarang. Semak sambungan dan cuba lagi.",
        );
        setLoading(null);
      }
    },
    [importSummary?.queue, isGuest, loadQueue, openQueue],
  );

  const hasNew = effectiveNewPages > 0;
  const hasReview = effectiveReviewPages > 0;
  const showStartFresh = !isGuest && canStartFresh && !effectiveHasProgress;
  const canOpenMemorizeFlow = hasNew || showStartFresh;
  const showFirstRunPaths = !isGuest && !effectiveHasProgress;

  return (
    <>
      {pendingJourney ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-stone-950/60 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/95 p-6 shadow-2xl dark:bg-stone-900/95">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 animate-pulse rounded-2xl bg-amber-200/80 dark:bg-amber-500/25" />
              <div className="space-y-2">
                <div className="h-3 w-28 rounded-full bg-stone-200 dark:bg-stone-700" />
                <div className="h-4 w-44 rounded-full bg-stone-300 dark:bg-stone-600" />
              </div>
            </div>
            <p className="mt-5 text-lg font-semibold text-stone-900 dark:text-stone-100">
              {pendingJourney.actionLabel}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-stone-600 dark:text-stone-300">
              {pendingJourney.helperText}
            </p>
            <div className="mt-5 grid grid-cols-3 gap-3">
              <div className="h-20 rounded-2xl bg-stone-100 dark:bg-stone-800" />
              <div className="h-20 rounded-2xl bg-stone-100 dark:bg-stone-800" />
              <div className="h-20 rounded-2xl bg-stone-100 dark:bg-stone-800" />
            </div>
            <p className="mt-4 text-xs uppercase tracking-[0.18em] text-stone-500 dark:text-stone-400">
              Halaman {pendingJourney.pageNumber}
            </p>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-8">
        {showFirstRunPaths ? (
          <div className="rounded-3xl border border-stone-200/80 bg-white/85 p-6 shadow-sm backdrop-blur-sm dark:border-stone-700/50 dark:bg-stone-900/70 sm:p-8">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-700 dark:text-amber-300">
                Langkah Pertama
              </p>
              <h3 className="mt-2 text-2xl font-bold text-stone-900 dark:text-stone-100">
                Mulakan Hifz ikut keadaan sebenar anda
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-stone-600 dark:text-stone-300">
                Pilih jalan yang paling dekat dengan keadaan anda sekarang. Kami akan bantu anda mula dengan lebih tenang, bukan kosong-kosong.
              </p>
            </div>

            <div className="mt-6 grid gap-3 lg:grid-cols-3">
              <button
                type="button"
                onClick={() => setEntryPath("fresh")}
                className={`rounded-2xl border px-4 py-4 text-left transition ${
                  entryPath === "fresh"
                    ? "border-amber-400 bg-amber-50 text-amber-950 shadow-sm dark:border-amber-500/70 dark:bg-amber-900/25 dark:text-amber-50"
                    : "border-stone-200 bg-white/75 text-stone-700 hover:border-amber-200 hover:bg-amber-50/60 dark:border-stone-700 dark:bg-stone-900/60 dark:text-stone-200 dark:hover:border-amber-500/40 dark:hover:bg-amber-900/15"
                }`}
              >
                <p className="text-sm font-semibold">Saya belum mula</p>
                <p className="mt-1 text-sm leading-relaxed opacity-80">
                  Mula dari awal dengan sabak yang terus dibina untuk sesi pertama anda.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setEntryPath("import")}
                className={`rounded-2xl border px-4 py-4 text-left transition ${
                  entryPath === "import"
                    ? "border-indigo-400 bg-indigo-50 text-indigo-950 shadow-sm dark:border-indigo-500/70 dark:bg-indigo-900/25 dark:text-indigo-50"
                    : "border-stone-200 bg-white/75 text-stone-700 hover:border-indigo-200 hover:bg-indigo-50/60 dark:border-stone-700 dark:bg-stone-900/60 dark:text-stone-200 dark:hover:border-indigo-500/40 dark:hover:bg-indigo-900/15"
                }`}
              >
                <p className="text-sm font-semibold">Saya sudah hafal sampai halaman...</p>
                <p className="mt-1 text-sm leading-relaxed opacity-80">
                  Rekod hafalan sedia ada supaya heatmap, manzil, dan halaman seterusnya terus selari.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setEntryPath("test")}
                className={`rounded-2xl border px-4 py-4 text-left transition ${
                  entryPath === "test"
                    ? "border-teal-400 bg-teal-50 text-teal-950 shadow-sm dark:border-teal-500/70 dark:bg-teal-900/25 dark:text-teal-50"
                    : "border-stone-200 bg-white/75 text-stone-700 hover:border-teal-200 hover:bg-teal-50/60 dark:border-stone-700 dark:bg-stone-900/60 dark:text-stone-200 dark:hover:border-teal-500/40 dark:hover:bg-teal-900/15"
                }`}
              >
                <p className="text-sm font-semibold">Saya mahu uji hafalan sedia ada</p>
                <p className="mt-1 text-sm leading-relaxed opacity-80">
                  Buka mod tasmi&apos; pada halaman pilihan tanpa perlu tetapkan pelan penuh dahulu.
                </p>
              </button>
            </div>

            {entryPath === "fresh" ? (
              <div className="mt-6 rounded-2xl border border-amber-200/80 bg-amber-50/80 p-5 dark:border-amber-700/35 dark:bg-amber-900/20">
                <p className="text-sm font-semibold text-amber-950 dark:text-amber-100">
                  Mulakan terus dari awal
                </p>
                <p className="mt-2 text-sm leading-relaxed text-amber-900/80 dark:text-amber-100/80">
                  Kami akan sediakan sabak pertama anda secara automatik. Selepas itu, anda boleh dengar, ikut mushaf, tutup, dan uji terus pada halaman yang sama.
                </p>
                <button
                  type="button"
                  disabled={loading !== null || isPending}
                  onClick={() => handleCta("memorize")}
                  className="mt-4 rounded-xl bg-amber-500 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-amber-600 dark:hover:bg-amber-500"
                >
                  {loading === "memorize" ? "Menyediakan Sesi..." : "Mulakan Hafal dari Awal"}
                </button>
              </div>
            ) : null}

            {entryPath === "import" ? (
              <div className="mt-6 rounded-2xl border border-indigo-200/80 bg-indigo-50/80 p-5 dark:border-indigo-700/35 dark:bg-indigo-900/20">
                <p className="text-sm font-semibold text-indigo-950 dark:text-indigo-100">
                  Rekod halaman terakhir yang sudah anda hafal
                </p>
                <p className="mt-2 text-sm leading-relaxed text-indigo-900/80 dark:text-indigo-100/80">
                  Selepas import, kami terus kemas kini heatmap, jumlah manzil, dan halaman sambungan supaya anda tak perlu keluar masuk semula.
                </p>
                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="flex items-center gap-2">
                    <label
                      htmlFor="import-page"
                      className="text-sm font-medium text-indigo-900 dark:text-indigo-100"
                    >
                      Halaman:
                    </label>
                    <input
                      id="import-page"
                      type="number"
                      min={1}
                      max={604}
                      value={importPage}
                      onChange={(event) => setImportPage(event.target.value)}
                      placeholder="cth. 17"
                      className="w-28 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-indigo-700 dark:bg-stone-950 dark:text-stone-100 dark:placeholder:text-stone-500"
                    />
                    <span className="text-sm text-indigo-800/70 dark:text-indigo-200/70">
                      / 604
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={importing || !isValidPageNumber(importPage)}
                    onClick={handleImport}
                    className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-indigo-500 dark:hover:bg-indigo-400"
                  >
                    {importing ? "Merekod Hafalan..." : "Rekod Hafalan Sedia Ada"}
                  </button>
                </div>
              </div>
            ) : null}

            {entryPath === "test" ? (
              <div className="mt-6 rounded-2xl border border-teal-200/80 bg-teal-50/80 p-5 dark:border-teal-700/35 dark:bg-teal-900/20">
                <p className="text-sm font-semibold text-teal-950 dark:text-teal-100">
                  Uji halaman tertentu dahulu
                </p>
                <p className="mt-2 text-sm leading-relaxed text-teal-900/80 dark:text-teal-100/80">
                  Kami akan buka mushaf dalam mod tasmi&apos; dengan petunjuk kata pembuka. Ini sesuai kalau anda mahu semak tahap semasa sebelum tetapkan pelan.
                </p>
                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="flex items-center gap-2">
                    <label
                      htmlFor="test-page"
                      className="text-sm font-medium text-teal-900 dark:text-teal-100"
                    >
                      Halaman:
                    </label>
                    <input
                      id="test-page"
                      type="number"
                      min={1}
                      max={604}
                      value={testPage}
                      onChange={(event) => setTestPage(event.target.value)}
                      placeholder="cth. 17"
                      className="w-28 rounded-lg border border-teal-200 bg-white px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 dark:border-teal-700 dark:bg-stone-950 dark:text-stone-100 dark:placeholder:text-stone-500"
                    />
                    <span className="text-sm text-teal-800/70 dark:text-teal-200/70">
                      / 604
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={!isValidPageNumber(testPage) || isPending}
                    onClick={handleTestExisting}
                    className="rounded-xl bg-teal-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-teal-600 dark:hover:bg-teal-500"
                  >
                    Buka Ujian Hafalan
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {importError ? (
          <div className="rounded-2xl border border-red-200 bg-red-50/80 px-5 py-4 text-sm text-red-700 shadow-sm dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
            {importError}
          </div>
        ) : null}

        {queueError ? (
          <div className="rounded-2xl border border-red-200 bg-red-50/80 px-5 py-4 text-sm text-red-700 shadow-sm dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
            {queueError}
          </div>
        ) : null}

        {testError ? (
          <div className="rounded-2xl border border-red-200 bg-red-50/80 px-5 py-4 text-sm text-red-700 shadow-sm dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
            {testError}
          </div>
        ) : null}

        {importSummary ? (
          <div className="rounded-3xl border border-emerald-200/80 bg-emerald-50/80 p-6 shadow-sm backdrop-blur-sm dark:border-emerald-700/40 dark:bg-emerald-950/30 sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-300">
              Ringkasan Import
            </p>
            <h3 className="mt-2 text-2xl font-bold text-stone-900 dark:text-stone-100">
              Hafalan sedia ada berjaya direkod
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-stone-700 dark:text-stone-300">
              {importSummary.nextPage
                ? `Halaman 1 hingga ${importSummary.upToPage} kini ditanda sebagai hafalan sedia ada. Halaman sambungan anda ialah ${importSummary.nextPage}.`
                : "Semua 604 halaman sudah direkod sebagai hafalan sedia ada. Ulangan akan muncul ikut jadual FSRS anda."}
            </p>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-white/85 p-4 shadow-sm dark:bg-stone-900/55">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-300">
                  Dikemas Kini
                </p>
                <p className="mt-2 text-2xl font-bold text-stone-900 dark:text-stone-100">
                  {importSummary.upToPage}
                </p>
                <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
                  halaman kini direkod
                </p>
              </div>
              <div className="rounded-2xl bg-white/85 p-4 shadow-sm dark:bg-stone-900/55">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-300">
                  Halaman Seterusnya
                </p>
                <p className="mt-2 text-2xl font-bold text-stone-900 dark:text-stone-100">
                  {importSummary.nextPage ?? "-"}
                </p>
                <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
                  sambung hafal dari sini
                </p>
              </div>
              <div className="rounded-2xl bg-white/85 p-4 shadow-sm dark:bg-stone-900/55">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-300">
                  Pelan Hari Ini
                </p>
                <p className="mt-2 text-2xl font-bold text-stone-900 dark:text-stone-100">
                  {importSummary.newPages}
                </p>
                <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
                  halaman baru, {importSummary.reviewPages} halaman ulangan
                </p>
              </div>
            </div>

            <p className="mt-5 text-sm leading-relaxed text-stone-600 dark:text-stone-300">
              {importSummary.newPages > 0 && importSummary.nextPage
                ? `Cadangan sekarang: buka halaman ${importSummary.nextPage} dan teruskan sabak pertama anda.`
                : "Tiada halaman baru dijadualkan sekarang. Bila tiba masanya, ulangan akan muncul terus di sini."}
            </p>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              {importSummary.queue && importSummary.queue.pageOrder.length > 0 ? (
                <button
                  type="button"
                  onClick={() => openQueue("memorize", importSummary.queue!)}
                  className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-400"
                >
                  Teruskan Hafal di Halaman {importSummary.nextPage}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() =>
                  startTransition(() => {
                    router.refresh();
                  })
                }
                className="rounded-xl border border-emerald-300 bg-white/80 px-5 py-3 text-sm font-semibold text-emerald-900 transition hover:bg-white dark:border-emerald-700 dark:bg-stone-900/50 dark:text-emerald-200 dark:hover:bg-stone-900"
              >
                Segarkan Ringkasan
              </button>
            </div>
          </div>
        ) : null}

        <div className="rounded-2xl border border-stone-200/80 bg-white/80 p-6 shadow-sm backdrop-blur-sm dark:border-stone-700/50 dark:bg-stone-900/60 sm:p-8">
          <h2 className="mb-4 text-2xl font-bold text-stone-900 dark:text-stone-100">
            Hafalan Hari Ini
          </h2>

          <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-base text-stone-600 dark:text-stone-400">
            {hasNew ? (
              <span>
                <span className="font-semibold text-amber-600 dark:text-amber-400">
                  {effectiveNewPages}
                </span>{" "}
                halaman baru
              </span>
            ) : null}
            {hasNew && hasReview ? <span aria-hidden="true">&middot;</span> : null}
            {hasReview ? (
              <span>
                <span className="font-semibold text-teal-600 dark:text-teal-400">
                  {effectiveReviewPages}
                </span>{" "}
                halaman perlu diuji
              </span>
            ) : null}
            {!hasNew && !hasReview ? (
              <span className="text-stone-500 dark:text-stone-400">
                Tiada hafalan dijadualkan hari ini.
              </span>
            ) : null}
          </div>

          {effectiveGlobalStreak > 0 ? (
            <p className="mb-6 text-sm text-stone-500 dark:text-stone-400">
              Streak semasa: {effectiveGlobalStreak} hari
            </p>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              disabled={!canOpenMemorizeFlow || loading !== null || isGuest || isPending}
              onClick={() => handleCta("memorize")}
              className="flex-1 rounded-xl bg-amber-500 px-6 py-3.5 text-base font-semibold text-white shadow-sm transition-all hover:bg-amber-600 active:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-amber-600 dark:hover:bg-amber-500"
            >
              {loading === "memorize"
                ? "Memuatkan..."
                : showStartFresh
                  ? "Mulakan Hafal"
                  : "Hafal Baru"}
            </button>

            <button
              type="button"
              disabled={!hasReview || loading !== null || isGuest || isPending}
              onClick={() => handleCta("review")}
              className="flex-1 rounded-xl bg-teal-600 px-6 py-3.5 text-base font-semibold text-white shadow-sm transition-all hover:bg-teal-700 active:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-teal-600 dark:hover:bg-teal-500"
            >
              {loading === "review" ? "Memuatkan..." : "Uji Hafalan"}
            </button>
          </div>

          {!hasNew && hasReview ? (
            <p className="mt-3 text-center text-sm text-stone-400 dark:text-stone-500">
              Tiada halaman baru hari ini
            </p>
          ) : null}
          {hasNew && !hasReview ? (
            <p className="mt-3 text-center text-sm text-stone-400 dark:text-stone-500">
              Tiada ulangan hari ini
            </p>
          ) : null}
          {showStartFresh ? (
            <p className="mt-3 text-center text-sm text-stone-500 dark:text-stone-400">
              Belum ada jadual hafalan. Pilih jalan mula di atas supaya kami boleh buka sesi yang sesuai untuk anda.
            </p>
          ) : null}
        </div>

        <JuzHeatmap juzProgress={effectiveJuzProgress} />
      </div>
    </>
  );
}
