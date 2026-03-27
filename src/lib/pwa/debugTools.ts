"use client";

import { downloadMushaf, loadPwaConfig, cancelDownload } from "./downloadEngine";
import {
  isMushafDownloaded,
  clearMushafDownloaded,
} from "./mushafStatus";

export function installDebugTools(): void {
  if (typeof window === "undefined") return;

  const debug = {
    async downloadMushaf() {
      const config = await loadPwaConfig();
      console.log("[PWA Debug] Downloading full mushaf + tema...");
      await downloadMushaf(config, (progress) => {
        console.log(
          `[PWA Debug] ${progress.completedItems}/${progress.totalItems} items`,
        );
      });
      console.log("[PWA Debug] Done.");
    },
    cancelDownload,
    async mushafStatus() {
      const config = await loadPwaConfig();
      const status = await isMushafDownloaded(
        config.cdnAssetVersion,
        config.temaDataVersion ?? "1",
      );
      console.log("[PWA Debug] Mushaf status:", status);
      return status;
    },
    async clearDownload() {
      clearMushafDownloaded();
      await caches.delete("mushaf-images-v1");
      await caches.delete("mushaf-data-v1");
      await caches.delete("tema-data-v1");
      console.log("[PWA Debug] Download cleared (localStorage + caches).");
    },
  };

  (window as unknown as Record<string, unknown>).__miftahDebug = debug;
  if (process.env.NODE_ENV === "development") {
    // Intentional: debug announcement only in dev builds
    console.log(
      "[PWA Debug] Tools: window.__miftahDebug.downloadMushaf(), .mushafStatus(), .cancelDownload(), .clearDownload()",
    );
  }
}
