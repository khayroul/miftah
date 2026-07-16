"use client";

import { createPortal } from "react-dom";

export interface FahamSessionSummary {
  correctCount: number;
  foundCount: number;
  masteredCount: number;
  totalCount: number;
}

function formatMetricValue(value: number): string {
  return value.toLocaleString();
}

function buildSummaryGuidance(correctCount: number, totalCount: number): string {
  const missedCount = Math.max(0, totalCount - correctCount);
  if (missedCount === 0) {
    return "Semua jawapan tepat pada cubaan pertama. Teruskan dengan sesi pendek seterusnya untuk kekalkan rentak.";
  }
  if (missedCount === 1) {
    return "Satu perkataan akan muncul semula dalam ulang kaji supaya ingatan menjadi lebih kukuh.";
  }
  return `${missedCount} perkataan akan muncul semula dalam ulang kaji supaya ingatan menjadi lebih kukuh.`;
}

export function FahamSessionSummaryModal({
  onClose,
  summary,
}: {
  onClose: () => void;
  summary: FahamSessionSummary | null;
}) {
  if (!summary || typeof document === "undefined") {
    return null;
  }

  const accuracy =
    summary.totalCount > 0
      ? Math.round((summary.correctCount / summary.totalCount) * 100)
      : 0;

  return createPortal(
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-stone-950/55 px-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="faham-session-summary-title"
        aria-describedby="faham-session-summary-guidance"
        className="ui-surface-solid animate-bounce-in relative w-full max-w-sm rounded-[2rem] p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="ui-touch-target absolute right-3 top-3 inline-flex items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
          aria-label="Tutup rumusan sesi"
        >
          <svg
            aria-hidden="true"
            className="h-5 w-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path
              d="m6 6 12 12M18 6 6 18"
              strokeLinecap="round"
            />
          </svg>
        </button>

        <div className="text-center">
          <p className="ui-eyebrow">Sesi selesai</p>
          <p className="mt-3 text-6xl font-bold tracking-tight text-brand">
            {accuracy}%
          </p>
          <p
            id="faham-session-summary-title"
            className="mt-2 text-sm font-semibold text-foreground"
          >
            Ketepatan cubaan pertama
          </p>
          <p className="mt-1 text-sm text-muted">
            {summary.correctCount} daripada {summary.totalCount} kad
          </p>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-surface-muted px-3 py-3">
              <p className="text-xl font-bold text-foreground">
                {formatMetricValue(summary.foundCount)}
              </p>
              <p className="mt-1 text-xs font-medium text-muted">Ditemui</p>
            </div>
            <div className="rounded-2xl bg-surface-muted px-3 py-3">
              <p className="text-xl font-bold text-foreground">
                {formatMetricValue(summary.masteredCount)}
              </p>
              <p className="mt-1 text-xs font-medium text-muted">Dikuasai</p>
            </div>
          </div>
        </div>

        <p
          id="faham-session-summary-guidance"
          className="mt-5 rounded-2xl border border-border-subtle bg-brand-soft/45 px-4 py-3 text-sm leading-relaxed text-foreground"
        >
          {buildSummaryGuidance(summary.correctCount, summary.totalCount)}
        </p>

        <button
          type="button"
          onClick={onClose}
          className="ui-touch-target mt-5 inline-flex w-full touch-manipulation items-center justify-center rounded-2xl bg-brand px-5 py-3 text-base font-semibold text-white transition-colors hover:bg-brand-strong dark:text-slate-950"
        >
          Lihat sesi seterusnya
        </button>
      </section>
    </div>,
    document.body,
  );
}
