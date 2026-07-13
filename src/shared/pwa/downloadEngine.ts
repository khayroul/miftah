import { prefetchFahamTierVocabPackage } from "@/features/faham/client";
import { TOTAL_PAGES, TOTAL_TEMA_ENTRIES } from "./offlineBundle";
import {
  isMushafDownloaded,
  markMushafDownloaded,
} from "./mushafStatus";
import {
  cacheGlobalFonts,
  cacheOfflineShellAssets,
  downloadPage,
  downloadTemaBundle,
  prepareStorage,
} from "./downloadCache";
import type { PwaConfig } from "./downloadConfig";
import { migrateIfVersionChanged } from "./downloadMigration";
import {
  MUSHAF_PACKAGE_TOTAL_ITEMS,
  TEMA_PACKAGE_TOTAL_ITEMS,
  clearDownloadCheckpoint,
  emitProgress,
  readDownloadCheckpoint,
  resolveInitialPackageState,
  withMushafProgress,
  withTemaProgress,
  writeDownloadCheckpoint,
  type DownloadPackageId,
  type ProgressCallback,
} from "./downloadPackages";

export {
  buildPageAssetUrls,
  loadPwaConfig,
  type PageAssetUrls,
  type PwaConfig,
} from "./downloadConfig";
export {
  DOWNLOAD_PACKAGES,
  getDownloadCheckpointPackage,
  type DownloadPackageDefinition,
  type DownloadPackageId,
  type MushafDownloadProgress,
} from "./downloadPackages";

let activeController: AbortController | null = null;
let isDownloading = false;

export function cancelDownload(): void {
  if (activeController !== null) {
    activeController.abort();
    activeController = null;
  }
}

async function downloadTemaPackage(
  controller: AbortController,
  completedItems: number,
  packageProgress: Awaited<ReturnType<typeof resolveInitialPackageState>>["packageProgress"],
  onProgress?: ProgressCallback,
): Promise<{ completedItems: number; packageProgress: typeof packageProgress }> {
  let completed = completedItems;
  let progress = packageProgress;

  for (let surah = 1; surah <= TOTAL_TEMA_ENTRIES; surah += 2) {
    if (controller.signal.aborted) break;
    const batch = [downloadTemaBundle(surah, controller)];
    if (surah + 1 <= TOTAL_TEMA_ENTRIES) {
      batch.push(downloadTemaBundle(surah + 1, controller));
    }
    const insertedCount = (await Promise.all(batch)).reduce((sum, value) => sum + value, 0);
    completed += insertedCount;
    progress = withTemaProgress(progress, insertedCount);
    emitProgress(completed, "tema", progress, onProgress);
  }

  return { completedItems: completed, packageProgress: progress };
}

async function downloadMushafPackage(
  config: PwaConfig,
  controller: AbortController,
  completedItems: number,
  packageProgress: Awaited<ReturnType<typeof resolveInitialPackageState>>["packageProgress"],
  onProgress?: ProgressCallback,
): Promise<{ completedItems: number; packageProgress: typeof packageProgress }> {
  let completed = completedItems;
  let progress = packageProgress;

  const insertedShell = await cacheOfflineShellAssets(controller);
  completed += insertedShell;
  progress = withMushafProgress(progress, insertedShell);
  emitProgress(completed, "mushaf", progress, onProgress);

  for (let page = 1; page <= TOTAL_PAGES; page += 2) {
    if (controller.signal.aborted) break;
    const batch = [downloadPage(page, config, controller)];
    if (page + 1 <= TOTAL_PAGES) batch.push(downloadPage(page + 1, config, controller));
    const insertedCount = (await Promise.all(batch)).reduce((sum, value) => sum + value, 0);
    completed += insertedCount;
    progress = withMushafProgress(progress, insertedCount);
    emitProgress(completed, "mushaf", progress, onProgress);
  }

  const insertedFonts = await cacheGlobalFonts(controller);
  completed += insertedFonts;
  progress = withMushafProgress(progress, insertedFonts);
  emitProgress(completed, "mushaf", progress, onProgress);
  return { completedItems: completed, packageProgress: progress };
}

async function finalizeDownload(
  config: PwaConfig,
  controller: AbortController,
  temaDataVersion: string,
  fahamDataVersion: string,
  appBuildId: string,
): Promise<void> {
  if (controller.signal.aborted) return;
  const finalStatus = await isMushafDownloaded(
    config.cdnAssetVersion,
    temaDataVersion,
    appBuildId,
  );
  if (finalStatus.state !== "complete") {
    throw new Error("Muat turun belum lengkap. Cuba semula semasa sambungan stabil.");
  }

  markMushafDownloaded(config.cdnAssetVersion, temaDataVersion, appBuildId);
  clearDownloadCheckpoint();
  void prefetchFahamTierVocabPackage({
    appBuildId,
    controller,
    dataVersion: fahamDataVersion,
  }).catch(() => undefined);
}

export async function downloadMushaf(
  config: PwaConfig,
  onProgress?: ProgressCallback,
): Promise<void> {
  if (isDownloading) return;
  isDownloading = true;
  const controller = new AbortController();
  activeController = controller;

  const temaDataVersion = config.temaDataVersion ?? "1";
  const fahamDataVersion = config.fahamDataVersion ?? "1";
  const appBuildId = config.appBuildId ?? "unknown";

  try {
    await migrateIfVersionChanged(
      config.cdnAssetVersion,
      temaDataVersion,
      fahamDataVersion,
      appBuildId,
    );
    const baseline = await isMushafDownloaded(
      config.cdnAssetVersion,
      temaDataVersion,
      appBuildId,
    );
    if (baseline.state === "complete") {
      clearDownloadCheckpoint();
      return;
    }

    await prepareStorage();
    let completedItems = baseline.progress.completedItems;
    void readDownloadCheckpoint(config.cdnAssetVersion, temaDataVersion, appBuildId);
    const initial = await resolveInitialPackageState(
      completedItems,
      baseline.progress.tema,
    );
    let activePackageId: DownloadPackageId = initial.packageId;
    let packageProgress = initial.packageProgress;
    emitProgress(completedItems, activePackageId, packageProgress, onProgress);

    if (packageProgress.temaCompletedItems < TEMA_PACKAGE_TOTAL_ITEMS) {
      activePackageId = "tema";
      writeDownloadCheckpoint(activePackageId, config.cdnAssetVersion, temaDataVersion, appBuildId);
      emitProgress(completedItems, activePackageId, packageProgress, onProgress);
      ({ completedItems, packageProgress } = await downloadTemaPackage(
        controller,
        completedItems,
        packageProgress,
        onProgress,
      ));
    }

    if (
      !controller.signal.aborted &&
      packageProgress.temaCompletedItems >= TEMA_PACKAGE_TOTAL_ITEMS &&
      packageProgress.mushafCompletedItems < MUSHAF_PACKAGE_TOTAL_ITEMS
    ) {
      activePackageId = "mushaf";
      writeDownloadCheckpoint(activePackageId, config.cdnAssetVersion, temaDataVersion, appBuildId);
      emitProgress(completedItems, activePackageId, packageProgress, onProgress);
      ({ completedItems, packageProgress } = await downloadMushafPackage(
        config,
        controller,
        completedItems,
        packageProgress,
        onProgress,
      ));
    }

    await finalizeDownload(
      config,
      controller,
      temaDataVersion,
      fahamDataVersion,
      appBuildId,
    );
  } catch (error) {
    if (error instanceof DOMException && error.name === "QuotaExceededError") {
      throw new Error("Ruang storan tidak mencukupi (~260 MB diperlukan)");
    }
    throw error;
  } finally {
    isDownloading = false;
    if (activeController === controller) activeController = null;
  }
}
