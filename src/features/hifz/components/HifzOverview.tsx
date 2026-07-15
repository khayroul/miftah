"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { HifzReportCard } from "./HifzReportCard";
import { saveQueue } from "../domain/sessionQueue";
import type {
  HifzFlowType,
  HifzQueueItem,
} from "../domain/sessionQueue";
import type { HifzQueueResponse } from "../domain/queue";
import type { JuzStat, HifzStats } from "../domain/types";
import { getResumePoint, clearResumePoint, type HifzResumePoint } from "../domain/resumePoint";
import { getDifficultAyahCount } from "../domain/difficultAyahs";
import type { PageGridEntry } from "../domain/types";
import {
  HifzErrorNotice,
  HifzImportSummaryCard,
  HifzPendingJourneyOverlay,
  HifzResumeCard,
  HifzTodayCard,
  type HifzImportSummary,
  type HifzPendingJourney,
} from "./HifzOverviewCards";
import {
  HifzFirstRunPanel,
  type HifzEntryPath,
} from "./HifzFirstRunPanel";

interface ImportResponse extends HifzImportSummary {
  error?: string;
}

interface HifzOverviewProps {
  newPages: number;
  reviewPages: number;
  stats: HifzStats;
  globalStreak?: number;
  juzProgress: JuzStat[];
  pageGrid?: PageGridEntry[];
  isGuest: boolean;
  hasProgress: boolean;
  canStartFresh?: boolean;
}

export function HifzOverview({
  newPages,
  reviewPages,
  stats,
  globalStreak,
  juzProgress,
  pageGrid,
  isGuest,
  hasProgress,
  canStartFresh = false,
}: HifzOverviewProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [loading, setLoading] = useState<"memorize" | "review" | null>(null);
  const [entryPath, setEntryPath] = useState<HifzEntryPath>("fresh");
  const [importPage, setImportPage] = useState("");
  const [testPage, setTestPage] = useState("");
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [importSummary, setImportSummary] = useState<HifzImportSummary | null>(null);
  const [pendingJourney, setPendingJourney] = useState<HifzPendingJourney | null>(null);
  const [resumePoint, setResumePoint] = useState<HifzResumePoint | null>(null);
  const [difficultCount, setDifficultCount] = useState(0);

  useEffect(() => {
    setResumePoint(getResumePoint());
    setDifficultCount(getDifficultAyahCount());
  }, []);

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
      destination: HifzPendingJourney,
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
        actionLabel: "Membuka ujian ingatan",
        helperText: "Mushaf akan dibuka dengan petunjuk kata pembuka untuk bantu anda menguji hafalan sedia ada tanpa semakan suara.",
        pageNumber: page,
      },
      `/read/${page}?mode=hifz&from=hifz&intent=test`,
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

  const showStartFresh = !isGuest && canStartFresh && !effectiveHasProgress;
  const canOpenMemorizeFlow = effectiveNewPages > 0 || showStartFresh;
  const showFirstRunPaths = !isGuest && !effectiveHasProgress;

  return (
    <>
      {pendingJourney ? <HifzPendingJourneyOverlay journey={pendingJourney} /> : null}

      <div className="flex flex-col gap-8">
        {showFirstRunPaths ? (
          <HifzFirstRunPanel
            entryPath={entryPath}
            importPage={importPage}
            importing={importing}
            isPending={isPending}
            loading={loading}
            onEntryPathChange={setEntryPath}
            onImport={handleImport}
            onImportPageChange={setImportPage}
            onStartFresh={() => handleCta("memorize")}
            onTest={handleTestExisting}
            onTestPageChange={setTestPage}
            testPage={testPage}
          />
        ) : null}

        {importError ? <HifzErrorNotice message={importError} /> : null}
        {queueError ? <HifzErrorNotice message={queueError} /> : null}
        {testError ? <HifzErrorNotice message={testError} /> : null}

        {importSummary ? (
          <HifzImportSummaryCard
            summary={importSummary}
            onContinue={() => {
              if (importSummary.queue) openQueue("memorize", importSummary.queue);
            }}
            onRefresh={() => startTransition(() => router.refresh())}
          />
        ) : null}

        {resumePoint && !isGuest ? (
          <HifzResumeCard
            isPending={isPending}
            resumePoint={resumePoint}
            onResume={() => startTransition(() => {
              router.push(`/read/${resumePoint.pageNumber}?flow=${resumePoint.flow}&qi=${resumePoint.queueIndex}`);
            })}
            onDismiss={() => {
              clearResumePoint();
              setResumePoint(null);
            }}
          />
        ) : null}

        <HifzTodayCard
          canOpenMemorizeFlow={canOpenMemorizeFlow}
          difficultCount={difficultCount}
          globalStreak={effectiveGlobalStreak}
          isGuest={isGuest}
          isPending={isPending}
          loading={loading}
          newPages={effectiveNewPages}
          onMemorize={() => handleCta("memorize")}
          onReview={() => handleCta("review")}
          reviewPages={effectiveReviewPages}
          showStartFresh={showStartFresh}
        />

        <HifzReportCard
          juzProgress={effectiveJuzProgress}
          pageGrid={pageGrid ?? []}
        />
      </div>
    </>
  );
}
