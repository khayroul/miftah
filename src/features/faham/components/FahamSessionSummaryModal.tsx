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

  return createPortal(
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-stone-950/55 px-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="faham-session-summary-title"
        className="animate-bounce-in relative w-full max-w-sm rounded-[2rem] border border-teal-200/80 bg-[linear-gradient(160deg,rgba(240,253,250,0.98),rgba(255,255,255,0.98))] p-6 shadow-[0_30px_90px_-35px_rgba(20,184,166,0.4)] dark:border-teal-500/30 dark:bg-[linear-gradient(160deg,rgba(15,118,110,0.35),rgba(17,24,39,0.95))]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="text-center">
          <p className="text-6xl font-bold tracking-tight text-teal-700 dark:text-teal-300">
            {summary.correctCount}/{summary.totalCount}
          </p>
          <p
            id="faham-session-summary-title"
            className="mt-2 text-sm font-medium text-stone-500 dark:text-stone-400"
          >
            Jawapan betul
          </p>
          <div className="mt-4 flex justify-center gap-6 text-sm text-stone-500 dark:text-stone-400">
            <span>
              Ditemui{" "}
              <strong className="text-stone-700 dark:text-stone-200">
                {formatMetricValue(summary.foundCount)}
              </strong>
            </span>
            <span>
              Mahir{" "}
              <strong className="text-stone-700 dark:text-stone-200">
                {formatMetricValue(summary.masteredCount)}
              </strong>
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-6 inline-flex w-full items-center justify-center rounded-2xl bg-teal-600 px-5 py-3 text-base font-semibold text-white transition hover:bg-teal-700 dark:bg-teal-500 dark:text-teal-950 dark:hover:bg-teal-400"
        >
          Seterusnya
        </button>
      </section>
    </div>,
    document.body,
  );
}
