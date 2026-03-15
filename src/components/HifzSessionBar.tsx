"use client";

import { useEffect, useState } from "react";

interface HifzSessionBarProps {
  flow: "memorize" | "review";
  totalPages: number;
  completedPages: number;
  startTime: number;
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function HifzSessionBar({
  flow,
  totalPages,
  completedPages,
  startTime,
}: HifzSessionBarProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Date.now() - startTime);
    }, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  const progressPct = totalPages > 0 ? (completedPages / totalPages) * 100 : 0;
  const label = flow === "memorize" ? "Hafal" : "Ulang Kaji";

  return (
    <div className="fixed inset-x-0 top-0 z-40 border-b border-stone-200/60 bg-white/90 backdrop-blur-sm dark:border-stone-700/60 dark:bg-stone-900/90">
      <div className="mx-auto flex max-w-lg items-center gap-3 px-4 py-2">
        <span className="shrink-0 text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
          {label}
        </span>
        <div className="flex-1">
          <div className="h-1.5 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-700">
            <div
              className="h-full rounded-full bg-teal-500 transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
        <span className="shrink-0 text-xs font-medium text-stone-600 dark:text-stone-300">
          {completedPages}/{totalPages}
        </span>
        <span className="shrink-0 text-xs tabular-nums text-stone-500 dark:text-stone-400">
          {formatElapsed(elapsed)}
        </span>
      </div>
    </div>
  );
}
