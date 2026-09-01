"use client";

import { useCallback, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type {
  HifzStats,
  JuzStat,
  PageGridEntry,
  PageGridStatus,
} from "../domain/types";
import {
  matchesHifzProgressFilter,
  summarizeHifzPageGrid,
  type HifzProgressFilter,
} from "../domain/progressExplorer";
import { JUZ_BOUNDARY_PAGES, JUZ_PAGE_COUNTS } from "../domain/constants";
import { HifzPageActionSheet } from "./HifzPageActionSheet";

interface HifzReportCardProps {
  globalStreak: number;
  juzProgress: JuzStat[];
  pageGrid: PageGridEntry[];
  stats: HifzStats;
}

const TOTAL_QURAN_PAGES = 604;

const STATUS_COLORS: Record<PageGridStatus, string> = {
  "not-started": "bg-stone-300 dark:bg-slate-600",
  sabak: "bg-amber-500 dark:bg-amber-400",
  sabqi: "bg-sky-500 dark:bg-sky-400",
  manzil: "bg-emerald-600 dark:bg-emerald-400",
  due: "bg-yellow-500 dark:bg-yellow-400",
  overdue: "bg-rose-600 dark:bg-rose-400",
};

type RelativeDateTranslator = (
  key: "relativeToday" | "relativeYesterday" | "relativeDaysAgo" | "relativeWeeksAgo" | "relativeMonthsAgo",
  values?: Record<string, number>,
) => string;

function juzCardColor(stat: JuzStat): string {
  const startedPages = stat.totalPages - stat.notStartedPages;
  if (startedPages <= 0) {
    return "border-border-subtle bg-surface-muted";
  }
  if (stat.manzilPagePct >= 75) {
    return "border-emerald-300 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/35";
  }
  if (stat.manzilPagePct >= 25) {
    return "border-teal-300 bg-teal-50 dark:border-teal-700 dark:bg-teal-950/30";
  }
  return "border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30";
}

function formatRelativeDate(isoDate: string, t: RelativeDateTranslator): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffDays === 0) return t("relativeToday");
  if (diffDays === 1) return t("relativeYesterday");
  if (diffDays < 7) return t("relativeDaysAgo", { count: diffDays });
  if (diffDays < 30) return t("relativeWeeksAgo", { count: Math.floor(diffDays / 7) });
  return t("relativeMonthsAgo", { count: Math.floor(diffDays / 30) });
}

export function HifzReportCard({
  globalStreak,
  juzProgress,
  pageGrid,
  stats,
}: HifzReportCardProps) {
  const t = useTranslations("hifz.reportCard");
  const tStatus = useTranslations("hifz.status");
  const [selectedJuz, setSelectedJuz] = useState<number | null>(null);
  const [filter, setFilter] = useState<HifzProgressFilter>("all");
  const [actionPage, setActionPage] = useState<PageGridEntry | null>(null);

  const statusLabels: Record<PageGridStatus, string> = {
    "not-started": tStatus("notStarted"),
    sabak: tStatus("sabak"),
    sabqi: tStatus("sabqi"),
    manzil: tStatus("manzil"),
    due: tStatus("due"),
    overdue: tStatus("overdue"),
  };
  const filterOptions: Array<{ label: string; value: HifzProgressFilter }> = [
    { label: t("filterAll"), value: "all" },
    { label: t("filterLearning"), value: "learning" },
    { label: t("filterDue"), value: "due" },
    { label: t("filterStrong"), value: "strong" },
    { label: t("filterNotStarted"), value: "not-started" },
  ];

  const pageSummary = useMemo(() => summarizeHifzPageGrid(pageGrid), [pageGrid]);
  const overallPct = (stats.totalManzilPages / TOTAL_QURAN_PAGES) * 100;
  const selectedPages = useMemo(() => {
    if (selectedJuz === null) return [];
    return pageGrid.filter(
      (entry) =>
        entry.juz === selectedJuz &&
        matchesHifzProgressFilter(entry, filter),
    );
  }, [filter, pageGrid, selectedJuz]);

  const handleJuzClick = useCallback((juz: number) => {
    setSelectedJuz((current) => (current === juz ? null : juz));
  }, []);

  const summaryItems = [
    { label: t("summaryStrong"), value: stats.totalManzilPages, detail: t("summaryPages"), color: "text-success" },
    { label: t("summaryLearning"), value: pageSummary.learningPages, detail: t("summaryPages"), color: "text-accent" },
    { label: t("summaryDue"), value: Math.max(stats.dueTodayPages, pageSummary.duePages), detail: t("summaryNow"), color: "text-warning" },
    { label: t("summaryStreak"), value: globalStreak, detail: t("summaryDays"), color: "text-brand-strong" },
  ];

  return (
    <section className="rounded-2xl bg-surface-solid p-5 shadow-[0_18px_55px_-38px_rgba(41,37,36,0.45)] sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-[-0.02em] text-foreground">{t("title")}</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">{t("description")}</p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 overflow-hidden rounded-xl bg-surface-muted sm:grid-cols-4">
        {summaryItems.map((item, index) => (
          <div
            key={item.label}
            className={`px-4 py-4 ${index % 2 === 1 ? "border-l border-border-subtle" : ""} ${index >= 2 ? "border-t border-border-subtle sm:border-t-0" : ""} ${index > 0 ? "sm:border-l sm:border-border-subtle" : ""}`}
          >
            <p className="text-xs font-semibold text-muted">{item.label}</p>
            <p className={`mt-1 text-2xl font-bold tabular-nums tracking-[-0.02em] ${item.color}`}>{item.value}</p>
            <p className="mt-0.5 text-xs text-muted">{item.detail}</p>
          </div>
        ))}
      </div>

      <div className="mt-5">
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="font-semibold text-foreground">{t("manzilProgress")}</span>
          <span className="tabular-nums text-muted">{t("pagesFraction", { completed: stats.totalManzilPages, total: TOTAL_QURAN_PAGES })}</span>
        </div>
        <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-surface-strong">
          <div className="h-full rounded-full bg-success transition-[width] duration-500" style={{ width: `${Math.max(0, Math.min(overallPct, 100))}%` }} />
        </div>
        <p className="mt-1.5 text-xs text-muted">{t("manzilPct", { pct: Math.round(overallPct) })}</p>
      </div>

      <>
          <div className="mt-7 border-t border-border-subtle pt-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-foreground">{t("mapTitle")}</h3>
                <p className="mt-1 text-sm text-muted">{t("mapDescription")}</p>
              </div>
              <div className="flex flex-wrap gap-2" role="group" aria-label={t("filterLabel")}>
                {filterOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={filter === option.value}
                    onClick={() => setFilter(option.value)}
                    className={`ui-touch-target min-h-10 rounded-lg px-3 text-xs font-semibold transition-colors ${filter === option.value ? "bg-foreground text-background" : "bg-surface-muted text-muted hover:bg-surface-strong hover:text-foreground"}`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs">
              {(Object.keys(STATUS_COLORS) as PageGridStatus[]).map((status) => (
                <span key={status} className="flex items-center gap-1.5">
                  <span className={`inline-block h-2.5 w-2.5 rounded-sm ${STATUS_COLORS[status]}`} />
                  <span className="text-muted">{statusLabels[status]}</span>
                </span>
              ))}
            </div>
          </div>

          <div className="mt-5 grid grid-cols-5 gap-2 sm:grid-cols-6">
            {juzProgress.map((stat) => {
              const isSelected = selectedJuz === stat.juz;
              const startedPages = stat.totalPages - stat.notStartedPages;
              const matchCount = pageGrid.filter((entry) => entry.juz === stat.juz && matchesHifzProgressFilter(entry, filter)).length;

              return (
                <button
                  key={stat.juz}
                  type="button"
                  onClick={() => handleJuzClick(stat.juz)}
                  className={`ui-touch-target rounded-xl border p-2.5 text-left transition-[box-shadow,transform] hover:-translate-y-0.5 hover:shadow-sm sm:p-3 ${juzCardColor(stat)} ${isSelected ? "ring-2 ring-brand ring-offset-2 ring-offset-background" : ""}`}
                >
                  <p className="text-xs font-bold text-foreground">{t("juzLabel", { juz: stat.juz })}</p>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-background/70">
                    {startedPages > 0 ? (
                      <div className="flex h-full">
                        <div className="h-full bg-emerald-600 dark:bg-emerald-400" style={{ width: `${stat.manzilPagePct}%` }} />
                        {stat.sabqiPages > 0 ? <div className="h-full bg-sky-500 dark:bg-sky-400" style={{ width: `${(stat.sabqiPages / stat.totalPages) * 100}%` }} /> : null}
                        {stat.sabakPages > 0 ? <div className="h-full bg-amber-500 dark:bg-amber-400" style={{ width: `${(stat.sabakPages / stat.totalPages) * 100}%` }} /> : null}
                      </div>
                    ) : null}
                  </div>
                  <p className="mt-1.5 text-xs text-muted">
                    {filter === "all" ? t("pagesStarted", { started: startedPages, total: stat.totalPages }) : t("filterMatches", { count: matchCount })}
                  </p>
                </button>
              );
            })}
          </div>

          {selectedJuz !== null ? (
            <div className="mt-5 rounded-xl bg-surface-muted p-4 sm:p-5">
              <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-base font-bold text-foreground">{t("juzLabel", { juz: selectedJuz })}</h3>
                <p className="text-xs text-muted">{t("pageRangeLabel", { start: JUZ_BOUNDARY_PAGES[selectedJuz - 1], end: JUZ_BOUNDARY_PAGES[selectedJuz - 1] + (JUZ_PAGE_COUNTS[selectedJuz] ?? 0) - 1 })}</p>
              </div>

              {selectedPages.length > 0 ? (
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-5 md:grid-cols-7">
                  {selectedPages.map((entry) => (
                    <button
                      key={entry.page}
                      type="button"
                      onClick={() => setActionPage(entry)}
                      className="ui-touch-target flex min-h-16 flex-col items-center justify-center rounded-lg bg-background px-2 py-2.5 transition-colors hover:bg-surface-solid"
                    >
                      <span className="text-sm font-semibold tabular-nums text-foreground">{entry.page}</span>
                      <span className={`mt-1 inline-block h-1.5 w-7 rounded-full ${STATUS_COLORS[entry.status]}`} />
                      {entry.lastReviewedAt ? (
                        <span className="mt-1 text-xs leading-tight text-muted">{formatRelativeDate(entry.lastReviewedAt, t)}</span>
                      ) : (
                        <span className="mt-1 text-xs leading-tight text-muted/60">—</span>
                      )}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="rounded-lg bg-background px-4 py-5 text-center text-sm text-muted">{t("noFilterMatches")}</p>
              )}
            </div>
          ) : (
            <p className="mt-4 text-center text-sm text-muted">{t("tapToView")}</p>
          )}
      </>

      {actionPage ? <HifzPageActionSheet entry={actionPage} onClose={() => setActionPage(null)} /> : null}
    </section>
  );
}
