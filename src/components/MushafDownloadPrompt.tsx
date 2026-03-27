"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  type MushafStatus,
  isMushafDownloaded,
  hasUserStartedDownload,
  setDownloadStarted,
  isPromptDismissed,
  dismissPrompt,
  TOTAL_ITEMS,
} from "@/lib/pwa/mushafStatus";
import {
  downloadMushaf,
  loadPwaConfig,
  type MushafDownloadProgress,
} from "@/lib/pwa/downloadEngine";

type UIState =
  | { readonly kind: "loading" }
  | { readonly kind: "prompt" }
  | { readonly kind: "downloading"; readonly completedItems: number }
  | { readonly kind: "complete" }
  | { readonly kind: "error"; readonly message: string }
  | { readonly kind: "hidden" };

export function MushafDownloadPrompt() {
  const pathname = usePathname();
  const [ui, setUi] = useState<UIState>({ kind: "loading" });
  const [minimized, setMinimized] = useState(false);
  const completeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (completeTimerRef.current !== null) {
        clearTimeout(completeTimerRef.current);
      }
    };
  }, []);

  const startDownload = useCallback(
    async (config: Awaited<ReturnType<typeof loadPwaConfig>>) => {
      try {
        await downloadMushaf(config, (progress: MushafDownloadProgress) => {
          setUi({
            kind: "downloading",
            completedItems: progress.completedItems,
          });
        });

        setUi({ kind: "complete" });
        completeTimerRef.current = setTimeout(() => {
          setUi({ kind: "hidden" });
        }, 3000);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Muat turun gagal";
        setUi({ kind: "error", message });
      }
    },
    [],
  );

  // Check status on mount
  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const config = await loadPwaConfig();
        const status: MushafStatus = await isMushafDownloaded(
          config.cdnAssetVersion,
          config.temaDataVersion ?? "1",
        );
        if (cancelled) return;

        const started = hasUserStartedDownload();

        if (status.state === "complete") {
          setUi({ kind: "hidden" });
          return;
        }

        if (status.state === "partial" && started) {
          // Auto-resume
          setUi({
            kind: "downloading",
            completedItems: status.completedItems,
          });
          startDownload(config);
          return;
        }

        // state is "none" or "partial" without user opt-in
        if (isPromptDismissed()) {
          setUi({ kind: "hidden" });
          return;
        }

        setUi({ kind: "prompt" });
      } catch {
        setUi({ kind: "hidden" });
      }
    }

    check();
    return () => {
      cancelled = true;
    };
  }, [startDownload]);

  const handleStart = useCallback(async () => {
    setDownloadStarted();
    setUi({ kind: "downloading", completedItems: 0 });
    try {
      const config = await loadPwaConfig();
      await startDownload(config);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Muat turun gagal";
      setUi({ kind: "error", message });
    }
  }, [startDownload]);

  const handleDismiss = useCallback(() => {
    dismissPrompt();
    setUi({ kind: "hidden" });
  }, []);

  const handleRetry = useCallback(async () => {
    setUi({ kind: "downloading", completedItems: 0 });
    try {
      const config = await loadPwaConfig();
      await startDownload(config);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Muat turun gagal";
      setUi({ kind: "error", message });
    }
  }, [startDownload]);

  const handleMinimize = useCallback(() => {
    setMinimized(true);
  }, []);

  // --- Render ---

  if (ui.kind === "loading" || ui.kind === "hidden") {
    return null;
  }

  // Prompt card: only on home page
  if (ui.kind === "prompt") {
    if (pathname !== "/") return null;

    return (
      <div className="mx-auto mt-4 max-w-md rounded-xl border border-amber-200/50 bg-amber-50/80 p-4 text-center shadow-sm dark:border-amber-800/30 dark:bg-amber-950/30">
        <p className="mb-3 text-sm text-amber-900 dark:text-amber-100">
          Muat turun Mushaf dan Tema untuk bacaan luar talian (~170 MB)
        </p>
        <div className="flex justify-center gap-3">
          <button
            onClick={handleStart}
            className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-700 dark:bg-teal-500 dark:hover:bg-teal-600"
          >
            Muat turun
          </button>
          <button
            onClick={handleDismiss}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Nanti
          </button>
        </div>
      </div>
    );
  }

  // Progress bar (downloading, complete, error): all pages
  if (ui.kind === "downloading") {
    if (minimized) {
      return (
        <button
          onClick={() => setMinimized(false)}
          className="fixed bottom-[env(safe-area-inset-bottom,0px)] right-4 z-50 mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-teal-600 text-white shadow-lg"
          aria-label="Tunjukkan kemajuan muat turun"
        >
          <span className="text-xs font-bold">
            {Math.round((ui.completedItems / TOTAL_ITEMS) * 100)}%
          </span>
        </button>
      );
    }

    const percentage = (ui.completedItems / TOTAL_ITEMS) * 100;

    return (
      <div
        className="fixed inset-x-0 bottom-[env(safe-area-inset-bottom,0px)] z-50 border-t border-gray-200 bg-white/95 px-4 py-2 backdrop-blur-sm dark:border-gray-700 dark:bg-gray-900/95"
        role="progressbar"
        aria-valuemin={0}
        aria-valuenow={ui.completedItems}
        aria-valuemax={TOTAL_ITEMS}
        aria-label="Memuat turun data Miftah"
      >
        <div className="mx-auto flex max-w-md items-center gap-3">
          <div className="flex-1">
            <div className="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
              <div
                className="h-full rounded-full bg-teal-500 transition-all duration-300"
                style={{ width: `${percentage}%` }}
              />
            </div>
          </div>
          <span className="whitespace-nowrap text-xs text-gray-600 dark:text-gray-300">
            {Math.round(percentage)}%
          </span>
          <button
            onClick={handleMinimize}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            aria-label="Kecilkan bar kemajuan"
          >
            ×
          </button>
        </div>
      </div>
    );
  }

  if (ui.kind === "complete") {
    return (
      <div className="fixed inset-x-0 bottom-[env(safe-area-inset-bottom,0px)] z-50 border-t border-teal-200 bg-teal-50/95 px-4 py-2 text-center backdrop-blur-sm dark:border-teal-800 dark:bg-teal-950/95">
        <span className="text-sm text-teal-700 dark:text-teal-300">
          Mushaf dan Tema sedia luar talian ✓
        </span>
      </div>
    );
  }

  if (ui.kind === "error") {
    return (
      <div className="fixed inset-x-0 bottom-[env(safe-area-inset-bottom,0px)] z-50 border-t border-red-200 bg-red-50/95 px-4 py-2 backdrop-blur-sm dark:border-red-800 dark:bg-red-950/95">
        <div className="mx-auto flex max-w-md items-center justify-between">
          <span className="text-sm text-red-700 dark:text-red-300">
            Muat turun terganggu
          </span>
          <button
            onClick={handleRetry}
            className="rounded-lg bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700"
          >
            Cuba semula
          </button>
        </div>
      </div>
    );
  }

  return null;
}
