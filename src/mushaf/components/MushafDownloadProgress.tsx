import { useTranslations } from "next-intl";
import {
  DOWNLOAD_PACKAGES,
  TOTAL_ITEMS,
  type DownloadPackageId,
  type MushafDownloadProgress,
  type OfflineBundleProgress,
} from "@/shared/pwa/download";

const TEMA_PACKAGE = DOWNLOAD_PACKAGES[0];
const MUSHAF_PACKAGE = DOWNLOAD_PACKAGES[1];
const TOTAL_TEMA_ROUTES = 114;

export function buildInitialDownloadProgress(
  completedItems: number,
  packageId: DownloadPackageId,
): MushafDownloadProgress {
  const pkg = packageId === "tema" ? TEMA_PACKAGE : MUSHAF_PACKAGE;
  return {
    completedItems,
    totalItems: TOTAL_ITEMS,
    packageId,
    packageLabel: pkg.label,
    packageIndex: pkg.index,
    packageCount: pkg.count,
    packageCompletedItems: 0,
    packageTotalItems: pkg.totalItems,
  };
}

export function buildResumeDownloadProgress(
  progress: OfflineBundleProgress,
  packageId: DownloadPackageId,
): MushafDownloadProgress {
  const temaRouteGuess = Math.min(progress.routes, TOTAL_TEMA_ROUTES);
  const temaCompletedItems = Math.min(
    TEMA_PACKAGE.totalItems,
    progress.tema + temaRouteGuess,
  );
  const mushafCompletedItems = Math.max(
    0,
    progress.completedItems - temaCompletedItems,
  );
  const packageCompletedItems =
    packageId === "tema"
      ? temaCompletedItems
      : Math.min(MUSHAF_PACKAGE.totalItems, mushafCompletedItems);

  return {
    ...buildInitialDownloadProgress(progress.completedItems, packageId),
    packageCompletedItems,
  };
}

function formatProgressLine(label: string, value: number, total: number) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-white/70 px-3 py-2 text-xs text-stone-700 dark:bg-stone-900/45 dark:text-stone-200">
      <span>{label}</span>
      <span className="font-semibold">
        {value}/{total}
      </span>
    </div>
  );
}

export function ProgressSummary({
  progress,
  compact = false,
}: {
  readonly progress: OfflineBundleProgress;
  readonly compact?: boolean;
}) {
  const t = useTranslations("mushaf.download");
  const containerClass = compact
    ? "mt-3 grid gap-2 sm:grid-cols-2"
    : "mt-4 grid gap-2 sm:grid-cols-2";

  return (
    <div className={containerClass}>
      {formatProgressLine(t("progressLabelPages"), progress.images, 604)}
      {formatProgressLine(t("progressLabelPageData"), progress.data, 1812)}
      {formatProgressLine(t("progressLabelTema"), progress.tema, 114)}
      {formatProgressLine(t("progressLabelRoutes"), progress.routes, 719)}
      {formatProgressLine(t("progressLabelFonts"), progress.fonts, 606)}
      {formatProgressLine(t("progressLabelShell"), progress.shell, 10)}
    </div>
  );
}

export function MushafOfflineReadyStatus({
  expanded,
  onRefresh,
  onToggle,
  progress,
}: {
  readonly expanded: boolean;
  readonly onRefresh: () => void;
  readonly onToggle: () => void;
  readonly progress: OfflineBundleProgress;
}) {
  const t = useTranslations("mushaf.download");
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top,0px)+4.5rem)] z-40 flex justify-center px-4 sm:justify-end sm:px-6">
      <div className="pointer-events-auto w-full max-w-[22rem] sm:w-auto sm:min-w-[18rem]">
        <button
          onClick={onToggle}
          className="inline-flex w-full items-center justify-between gap-2 rounded-full border border-stone-200 bg-white/95 px-4 py-2 text-sm font-medium text-stone-700 shadow-sm backdrop-blur transition hover:bg-white dark:border-stone-700 dark:bg-stone-900/92 dark:text-stone-100 dark:hover:bg-stone-900"
          aria-expanded={expanded}
          aria-label={t("statusAriaLabel")}
        >
          <span className="flex min-w-0 items-center gap-2">
            <span
              className="inline-flex h-2.5 w-2.5 rounded-full bg-teal-500"
              aria-hidden
            />
            <span className="truncate">{t("readyLabel")}</span>
          </span>
          <span className="shrink-0 text-xs text-stone-500 dark:text-stone-400">
            {expanded ? t("readyToggleClose") : t("readyToggleOpen")}
          </span>
        </button>

        {expanded ? (
          <div className="mt-2 rounded-2xl border border-stone-200/80 bg-white/90 p-4 shadow-sm backdrop-blur-sm dark:border-stone-700/50 dark:bg-stone-900/70">
            <div className="flex flex-col gap-3">
              <p className="text-sm text-stone-700 dark:text-stone-200">
                {t("readyDescription")}
              </p>
              <button
                onClick={onRefresh}
                className="inline-flex w-fit items-center rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 shadow-sm transition hover:bg-stone-50 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700"
              >
                {t("readyRefreshButton")}
              </button>
            </div>

            <ProgressSummary progress={progress} compact />
          </div>
        ) : null}
      </div>
    </div>
  );
}
