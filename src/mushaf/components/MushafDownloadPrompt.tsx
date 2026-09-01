"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  type MushafStatus,
  type OfflineBundleProgress,
  TOTAL_ITEMS,
  hasUserStartedDownload,
  isMushafDownloaded,
  setDownloadStarted,
} from "@/shared/pwa/download";
import {
  DownloadError,
  downloadMushaf,
  getDownloadCheckpointPackage,
  loadPwaConfig,
  type MushafDownloadProgress,
  type OptionalOfflineCacheHooks,
} from "@/shared/pwa/download";
import {
  buildInitialDownloadProgress,
  buildResumeDownloadProgress,
  MushafOfflineReadyStatus,
  ProgressSummary,
} from "./MushafDownloadProgress";

type UIState =
  | { readonly kind: "loading" }
  | { readonly kind: "prompt"; readonly progress: OfflineBundleProgress | null }
  | { readonly kind: "downloading"; readonly progress: MushafDownloadProgress }
  | { readonly kind: "complete" }
  | { readonly kind: "ready"; readonly progress: OfflineBundleProgress }
  | { readonly kind: "error"; readonly messageKey: string }
  | { readonly kind: "hidden" };

const TOTAL_TEMA_ITEMS = 114;

/**
 * Maps a caught error to a `mushaf.download.*` translation key at the call
 * site's classification boundary. Engines throw coded `DownloadError`s for
 * known failure modes; everything else (network errors, unexpected throws)
 * resolves to the caller-supplied generic fallback key so no raw/untranslated
 * message ever reaches the UI. Resolution to display text happens only at
 * render time via `t(messageKey)`.
 */
function resolveErrorMessageKey(error: unknown, fallbackKey: string): string {
  if (error instanceof DownloadError) {
    return error.code === "incomplete" ? "errorIncomplete" : "errorQuotaExceeded";
  }
  return fallbackKey;
}

export function MushafDownloadPrompt({
  optionalCache,
}: {
  readonly optionalCache?: OptionalOfflineCacheHooks;
}) {
  const t = useTranslations("mushaf.download");
  const pathname = usePathname();
  const [ui, setUi] = useState<UIState>({ kind: "loading" });
  const [minimized, setMinimized] = useState(false);
  const [readyExpanded, setReadyExpanded] = useState(false);
  const completeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (completeTimerRef.current !== null) {
        clearTimeout(completeTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (ui.kind === "ready") {
      setReadyExpanded(false);
    }
  }, [ui.kind]);

  const resolveReadyUi = useCallback(
    (status: MushafStatus): UIState => {
      if (status.state === "complete") {
        return pathname === "/"
          ? { kind: "ready", progress: status.progress }
          : { kind: "hidden" };
      }

      if (pathname !== "/") {
        return { kind: "hidden" };
      }

      return {
        kind: "prompt",
        progress: status.state === "none" ? null : status.progress,
      };
    },
    [pathname],
  );

  const checkStatus = useCallback(async (): Promise<MushafStatus> => {
    const config = await loadPwaConfig();
    return isMushafDownloaded(
      config.cdnAssetVersion,
      config.temaDataVersion ?? "1",
      config.appBuildId ?? "unknown",
    );
  }, []);

  const startDownload = useCallback(
    async (config: Awaited<ReturnType<typeof loadPwaConfig>>) => {
      try {
        await downloadMushaf(
          config,
          (progress: MushafDownloadProgress) => {
            setUi({
              kind: "downloading",
              progress,
            });
          },
          { optionalCache },
        );

        const status = await isMushafDownloaded(
          config.cdnAssetVersion,
          config.temaDataVersion ?? "1",
          config.appBuildId ?? "unknown",
        );

        if (status.state !== "complete") {
          throw new DownloadError("incomplete");
        }

        setUi({ kind: "complete" });
        completeTimerRef.current = setTimeout(() => {
          setUi(
            pathname === "/"
              ? { kind: "ready", progress: status.progress }
              : { kind: "hidden" },
          );
        }, 2200);
      } catch (error) {
        setUi({ kind: "error", messageKey: resolveErrorMessageKey(error, "errorGeneric") });
      }
    },
    [optionalCache, pathname],
  );

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const config = await loadPwaConfig();
        const status = await isMushafDownloaded(
          config.cdnAssetVersion,
          config.temaDataVersion ?? "1",
          config.appBuildId ?? "unknown",
        );
        if (cancelled) return;

        if (status.state === "complete") {
          setUi(resolveReadyUi(status));
          return;
        }

        const started = hasUserStartedDownload();
        if (status.state === "partial" && started) {
          const checkpointPackage =
            getDownloadCheckpointPackage(config) ??
            (status.progress.tema >= TOTAL_TEMA_ITEMS ? "mushaf" : "tema");
          setUi({
            kind: "downloading",
            progress: buildResumeDownloadProgress(status.progress, checkpointPackage),
          });
          void startDownload(config);
          return;
        }

        if (pathname === "/") {
          setUi({
            kind: "prompt",
            progress: status.state === "none" ? null : status.progress,
          });
          return;
        }

        setUi({ kind: "hidden" });
      } catch (error) {
        if (cancelled) return;
        const messageKey = resolveErrorMessageKey(error, "errorOfflineCheckFailed");
        setUi(pathname === "/" ? { kind: "error", messageKey } : { kind: "hidden" });
      }
    }

    void check();
    return () => {
      cancelled = true;
    };
  }, [pathname, resolveReadyUi, startDownload]);

  const handleStart = useCallback(async () => {
    setDownloadStarted();
    setUi({
      kind: "downloading",
      progress: buildInitialDownloadProgress(0, "tema"),
    });
    try {
      const config = await loadPwaConfig();
      await startDownload(config);
    } catch (error) {
      setUi({ kind: "error", messageKey: resolveErrorMessageKey(error, "errorGeneric") });
    }
  }, [startDownload]);

  const handleDismiss = useCallback(() => {
    setUi({ kind: "hidden" });
  }, []);

  const handleRetry = useCallback(async () => {
    try {
      const status = await checkStatus();
      if (status.state === "complete") {
        setUi(resolveReadyUi(status));
        return;
      }
    } catch {
      // Fall through to a fresh download attempt.
    }

    setUi({
      kind: "downloading",
      progress: buildInitialDownloadProgress(0, "tema"),
    });
    try {
      const config = await loadPwaConfig();
      await startDownload(config);
    } catch (error) {
      setUi({ kind: "error", messageKey: resolveErrorMessageKey(error, "errorGeneric") });
    }
  }, [checkStatus, resolveReadyUi, startDownload]);

  const handleRefreshStatus = useCallback(async () => {
    setUi({ kind: "loading" });
    try {
      const status = await checkStatus();
      setUi(resolveReadyUi(status));
    } catch (error) {
      setUi({ kind: "error", messageKey: resolveErrorMessageKey(error, "errorOfflineCheckFailed") });
    }
  }, [checkStatus, resolveReadyUi]);

  const handleMinimize = useCallback(() => {
    setMinimized(true);
  }, []);

  if (ui.kind === "loading" || ui.kind === "hidden") {
    return null;
  }

  if (ui.kind === "prompt") {
    if (pathname !== "/") return null;

    return (
      <div className="mx-auto mt-4 max-w-2xl rounded-2xl border border-amber-200/60 bg-amber-50/90 p-4 shadow-sm dark:border-amber-800/35 dark:bg-amber-950/25">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-xl">
            <p className="text-sm font-semibold text-amber-950 dark:text-amber-100">
              {t("promptTitle")}
            </p>
            <p className="mt-1 text-sm text-amber-900/90 dark:text-amber-200/90">
              {t("promptSubtitle")}
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleStart}
              className="ui-touch-target inline-flex items-center justify-center rounded-xl bg-teal-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 dark:bg-teal-500 dark:hover:bg-teal-600 dark:focus-visible:ring-teal-300 dark:focus-visible:ring-offset-stone-950"
            >
              {t("promptStartButton")}
            </button>
            <button
              onClick={handleDismiss}
              className="ui-touch-target inline-flex items-center justify-center rounded-xl border border-stone-300 px-4 text-sm font-semibold text-stone-700 transition-colors hover:bg-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-800 dark:focus-visible:ring-teal-300 dark:focus-visible:ring-offset-stone-950"
            >
              {t("promptLaterButton")}
            </button>
          </div>
        </div>

        {ui.progress ? <ProgressSummary progress={ui.progress} compact /> : null}
      </div>
    );
  }

  if (ui.kind === "downloading") {
    if (minimized) {
      return (
        <button
          onClick={() => setMinimized(false)}
          className="fixed bottom-[env(safe-area-inset-bottom,0px)] right-4 z-50 mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-teal-600 text-white shadow-lg"
          aria-label={t("minimizedAriaLabel")}
        >
          <span className="text-xs font-bold">
            {Math.round((ui.progress.completedItems / TOTAL_ITEMS) * 100)}%
          </span>
        </button>
      );
    }

    const percentage = (ui.progress.completedItems / TOTAL_ITEMS) * 100;

    return (
      <div
        className="fixed inset-x-0 bottom-[env(safe-area-inset-bottom,0px)] z-50 border-t border-stone-200 bg-white/95 px-4 py-2 backdrop-blur-sm dark:border-stone-700 dark:bg-gray-900/95"
        role="progressbar"
        aria-valuemin={0}
        aria-valuenow={ui.progress.completedItems}
        aria-valuemax={TOTAL_ITEMS}
        aria-label={t("progressBarAriaLabel")}
      >
        <div className="mx-auto max-w-md">
          <div className="mb-1 flex items-center justify-between text-[11px] text-stone-600 dark:text-stone-300">
            <span className="font-medium">
              {t("packageProgressLabel", {
                index: ui.progress.packageIndex,
                count: ui.progress.packageCount,
                label: ui.progress.packageLabel,
              })}
            </span>
            <span>
              {ui.progress.packageCompletedItems}/{ui.progress.packageTotalItems}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className="h-2 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-700">
                <div
                  className="h-full rounded-full bg-teal-500 transition-all duration-300"
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>
            <span className="whitespace-nowrap text-xs text-stone-600 dark:text-stone-300">
              {Math.round(percentage)}%
            </span>
            <button
              onClick={handleMinimize}
              className="ui-touch-target inline-flex items-center justify-center text-stone-400 transition hover:text-stone-600 dark:hover:text-stone-200"
              aria-label={t("minimizeAriaLabel")}
            >
              ×
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (ui.kind === "complete") {
    return (
      <div className="fixed inset-x-0 bottom-[env(safe-area-inset-bottom,0px)] z-50 border-t border-teal-200 bg-teal-50/95 px-4 py-2 text-center backdrop-blur-sm dark:border-teal-800 dark:bg-teal-950/95">
        <span className="text-sm text-teal-700 dark:text-teal-300">
          {t("completeMessage")}
        </span>
      </div>
    );
  }

  if (ui.kind === "ready") {
    if (pathname !== "/") {
      return null;
    }

    return (
      <MushafOfflineReadyStatus
        expanded={readyExpanded}
        onRefresh={handleRefreshStatus}
        onToggle={() => setReadyExpanded((prev) => !prev)}
        progress={ui.progress}
      />
    );
  }

  return (
    <div className="fixed inset-x-0 bottom-[env(safe-area-inset-bottom,0px)] z-50 border-t border-red-200 bg-red-50/95 px-4 py-2 backdrop-blur-sm dark:border-red-800 dark:bg-red-950/95">
      <div className="mx-auto flex max-w-3xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-sm text-red-700 dark:text-red-300">
          {t(ui.messageKey)}
        </span>
        <div className="flex gap-2">
          <button
            onClick={handleRetry}
            className="ui-touch-target inline-flex items-center justify-center rounded-xl bg-red-600 px-3 text-sm font-semibold text-white transition hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
          >
            {t("retryButton")}
          </button>
          {pathname === "/" ? (
            <button
              onClick={handleRefreshStatus}
              className="ui-touch-target inline-flex items-center justify-center rounded-xl border border-red-300 px-3 text-sm font-semibold text-red-700 transition hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 dark:border-red-700 dark:text-red-200 dark:hover:bg-red-900/40"
            >
              {t("checkStatusButton")}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
