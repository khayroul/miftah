"use client";

import { useState } from "react";
import type { PageGridEntry, PageGridStatus } from "../domain/types";

interface HifzPageGridProps {
  entries: PageGridEntry[];
}

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

export function HifzPageGrid({ entries }: HifzPageGridProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-2xl border border-stone-200/80 bg-white/80 p-4 shadow-sm backdrop-blur-sm dark:border-stone-700/50 dark:bg-stone-900/60 sm:p-6">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="mb-3 flex w-full items-center justify-between text-left"
      >
        <h3 className="text-lg font-bold text-stone-900 dark:text-stone-100">
          Peta Halaman
        </h3>
        <span className="text-xs text-stone-500 dark:text-stone-400">
          {expanded ? "Tutup" : "Buka"}
        </span>
      </button>

      {expanded ? (
        <>
          <div className="mb-3 flex flex-wrap gap-3 text-xs">
            {(Object.keys(STATUS_COLORS) as PageGridStatus[]).map((status) => (
              <div key={status} className="flex items-center gap-1">
                <span className={`inline-block h-3 w-3 rounded-sm ${STATUS_COLORS[status]}`} />
                <span className="text-stone-600 dark:text-stone-400">
                  {STATUS_LABELS[status]}
                </span>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-[repeat(20,1fr)] gap-px">
            {entries.map((entry) => (
              <a
                key={entry.page}
                href={`/read/${entry.page}`}
                title={`Hal. ${entry.page} — ${STATUS_LABELS[entry.status]}`}
                className={`aspect-square rounded-[2px] transition hover:ring-1 hover:ring-stone-400 ${STATUS_COLORS[entry.status]}`}
              />
            ))}
          </div>

          <p className="mt-2 text-right text-xs text-stone-400 dark:text-stone-500">
            604 halaman
          </p>
        </>
      ) : null}
    </div>
  );
}
