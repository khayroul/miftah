"use client";

import { useCallback, useMemo, useState } from "react";
import type { JuzStat, PageGridEntry, PageGridStatus } from "@/data/repositories/hifz";
import { JUZ_BOUNDARY_PAGES, JUZ_PAGE_COUNTS } from "../domain/constants";
import { HifzPageActionSheet } from "./HifzPageActionSheet";

interface HifzReportCardProps {
  juzProgress: JuzStat[];
  pageGrid: PageGridEntry[];
}

const TOTAL_QURAN_PAGES = 604;

const STATUS_COLORS: Record<PageGridStatus, string> = {
  "not-started": "bg-stone-200 dark:bg-stone-700",
  sabak: "bg-amber-400 dark:bg-amber-500",
  sabqi: "bg-sky-400 dark:bg-sky-500",
  manzil: "bg-emerald-500 dark:bg-emerald-400",
  due: "bg-yellow-400 dark:bg-yellow-500",
  overdue: "bg-red-500 dark:bg-red-400",
};

const STATUS_LABELS: Record<PageGridStatus, string> = {
  "not-started": "Belum mula",
  sabak: "Sabak",
  sabqi: "Sabqi",
  manzil: "Manzil",
  due: "Perlu ulang",
  overdue: "Tertunggak",
};

function juzCardColor(stat: JuzStat): string {
  const startedPages = stat.totalPages - stat.notStartedPages;
  if (startedPages <= 0) {
    return "border-stone-200 bg-stone-50 dark:border-stone-700 dark:bg-stone-800/60";
  }
  if (stat.manzilPagePct >= 75) {
    return "border-emerald-300 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-900/30";
  }
  if (stat.manzilPagePct >= 25) {
    return "border-teal-200 bg-teal-50 dark:border-teal-700 dark:bg-teal-900/25";
  }
  return "border-amber-200 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/25";
}

function formatRelativeDate(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffDays === 0) return "Hari ini";
  if (diffDays === 1) return "Semalam";
  if (diffDays < 7) return `${diffDays} hari lalu`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} minggu lalu`;
  return `${Math.floor(diffDays / 30)} bulan lalu`;
}

export function HifzReportCard({ juzProgress, pageGrid }: HifzReportCardProps) {
  const [selectedJuz, setSelectedJuz] = useState<number | null>(null);
  const [actionPage, setActionPage] = useState<PageGridEntry | null>(null);

  const totalManzilPages = juzProgress.reduce((sum, s) => sum + s.manzilPages, 0);
  const overallPct = (totalManzilPages / TOTAL_QURAN_PAGES) * 100;

  const pagesByJuz = useMemo(() => {
    const map = new Map<number, PageGridEntry[]>();
    for (const entry of pageGrid) {
      const existing = map.get(entry.juz);
      if (existing) {
        map.set(entry.juz, [...existing, entry]);
      } else {
        map.set(entry.juz, [entry]);
      }
    }
    return map;
  }, [pageGrid]);

  const handleJuzClick = useCallback((juz: number) => {
    setSelectedJuz((prev) => (prev === juz ? null : juz));
  }, []);

  const selectedPages = selectedJuz ? (pagesByJuz.get(selectedJuz) ?? []) : [];

  return (
    <div className="flex flex-col gap-4">
      {/* Overall progress bar */}
      <div className="rounded-2xl border border-stone-200/80 bg-white/80 p-5 shadow-sm backdrop-blur-sm dark:border-stone-700/50 dark:bg-stone-900/60 sm:p-6">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-bold text-stone-900 dark:text-stone-100">
            Kad Laporan Hifz
          </h2>
          <p className="text-sm font-medium text-stone-500 dark:text-stone-400">
            {totalManzilPages}/{TOTAL_QURAN_PAGES} halaman
          </p>
        </div>
        <div className="mt-3">
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-stone-200 dark:bg-stone-700">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-500 dark:bg-emerald-400"
              style={{ width: `${Math.max(0, Math.min(overallPct, 100))}%` }}
            />
          </div>
          <p className="mt-1.5 text-xs text-stone-500 dark:text-stone-400">
            {Math.round(overallPct)}% manzil
          </p>
        </div>

        {/* Legend */}
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
          {(Object.keys(STATUS_COLORS) as PageGridStatus[])
            .filter((s) => s !== "overdue")
            .map((status) => (
              <span key={status} className="flex items-center gap-1.5">
                <span className={`inline-block h-2.5 w-2.5 rounded-sm ${STATUS_COLORS[status]}`} />
                <span className="text-stone-600 dark:text-stone-400">{STATUS_LABELS[status]}</span>
              </span>
            ))}
        </div>
      </div>

      {/* Juz grid — all 30 visible */}
      <div className="grid grid-cols-5 gap-2 sm:grid-cols-6">
        {juzProgress.map((stat) => {
          const isSelected = selectedJuz === stat.juz;
          const startedPages = stat.totalPages - stat.notStartedPages;

          return (
            <button
              key={stat.juz}
              type="button"
              onClick={() => handleJuzClick(stat.juz)}
              className={`rounded-xl border p-2.5 text-left transition-all sm:p-3 ${juzCardColor(stat)} ${
                isSelected
                  ? "ring-2 ring-teal-500 ring-offset-1 dark:ring-teal-400 dark:ring-offset-stone-900"
                  : "hover:shadow-sm"
              }`}
            >
              <p className="text-xs font-bold text-stone-800 dark:text-stone-200">
                Juz {stat.juz}
              </p>
              {/* Mini progress bar */}
              <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-stone-200/80 dark:bg-stone-600">
                {startedPages > 0 ? (
                  <div className="flex h-full">
                    <div
                      className="h-full bg-emerald-500 dark:bg-emerald-400"
                      style={{ width: `${stat.manzilPagePct}%` }}
                    />
                    {stat.sabqiPages > 0 ? (
                      <div
                        className="h-full bg-sky-400 dark:bg-sky-500"
                        style={{
                          width: `${(stat.sabqiPages / stat.totalPages) * 100}%`,
                        }}
                      />
                    ) : null}
                    {stat.sabakPages > 0 ? (
                      <div
                        className="h-full bg-amber-400 dark:bg-amber-500"
                        style={{
                          width: `${(stat.sabakPages / stat.totalPages) * 100}%`,
                        }}
                      />
                    ) : null}
                  </div>
                ) : null}
              </div>
              <p className="mt-1 text-[10px] text-stone-500 dark:text-stone-400">
                {startedPages}/{stat.totalPages}
              </p>
            </button>
          );
        })}
      </div>

      {/* Level 2 — Page detail for selected juz */}
      {selectedJuz !== null ? (
        <div className="animate-[fadeInUp_300ms_ease-out] rounded-2xl border border-stone-200/80 bg-white/80 p-4 shadow-sm backdrop-blur-sm dark:border-stone-700/50 dark:bg-stone-900/60 sm:p-6">
          <div className="mb-4 flex items-baseline justify-between">
            <h3 className="text-base font-bold text-stone-900 dark:text-stone-100">
              Juz {selectedJuz}
            </h3>
            <p className="text-xs text-stone-500 dark:text-stone-400">
              Halaman {JUZ_BOUNDARY_PAGES[selectedJuz - 1]}–
              {JUZ_BOUNDARY_PAGES[selectedJuz - 1] + (JUZ_PAGE_COUNTS[selectedJuz] ?? 0) - 1}
            </p>
          </div>

          <div className="grid grid-cols-4 gap-2 sm:grid-cols-5 md:grid-cols-7">
            {selectedPages.map((entry) => (
              <button
                key={entry.page}
                type="button"
                onClick={() => setActionPage(entry)}
                className={`flex flex-col items-center rounded-lg border px-2 py-2.5 transition hover:shadow-sm ${
                  entry.status === "not-started"
                    ? "border-stone-200 bg-stone-50 dark:border-stone-700 dark:bg-stone-800/50"
                    : entry.status === "manzil"
                      ? "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/30"
                      : entry.status === "sabqi"
                        ? "border-sky-200 bg-sky-50 dark:border-sky-800 dark:bg-sky-900/30"
                        : entry.status === "sabak"
                          ? "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/30"
                          : entry.status === "due"
                            ? "border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-900/30"
                            : "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/30"
                }`}
              >
                <span className="text-sm font-semibold text-stone-800 dark:text-stone-200">
                  {entry.page}
                </span>
                <span
                  className={`mt-1 inline-block h-1.5 w-6 rounded-full ${STATUS_COLORS[entry.status]}`}
                />
                {entry.lastReviewedAt ? (
                  <span className="mt-1 text-[9px] leading-tight text-stone-400 dark:text-stone-500">
                    {formatRelativeDate(entry.lastReviewedAt)}
                  </span>
                ) : (
                  <span className="mt-1 text-[9px] leading-tight text-stone-300 dark:text-stone-600">
                    —
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-center text-sm text-stone-400 dark:text-stone-500">
          Ketuk mana-mana juz untuk lihat halaman
        </p>
      )}

      {/* Action sheet */}
      {actionPage ? (
        <HifzPageActionSheet
          entry={actionPage}
          onClose={() => setActionPage(null)}
        />
      ) : null}
    </div>
  );
}
