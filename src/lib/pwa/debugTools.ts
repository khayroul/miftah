"use client";

import { downloadSurah, loadPwaConfig, cancelDownload } from "./downloadEngine";
import { getAllPacks } from "./packDb";

export function installDebugTools(): void {
  if (typeof window === "undefined") return;

  const debug = {
    async downloadSurah(surahId: number) {
      const config = await loadPwaConfig();
      console.log(`[PWA Debug] Downloading surah ${surahId}...`);
      await downloadSurah(surahId, config, (progress) => {
        console.log(
          `[PWA Debug] Surah ${progress.surahId}: ${progress.downloadedPages}/${progress.totalPages} (${progress.status})`,
        );
      });
      console.log(`[PWA Debug] Done.`);
    },
    cancelDownload,
    async listPacks() {
      const packs = await getAllPacks();
      console.table(packs.map((p) => ({
        surah: p.surahId,
        status: p.status,
        pages: `${p.downloadedPages}/${p.totalPages}`,
        size: `${(p.totalSizeBytes / 1024).toFixed(0)} KB`,
      })));
    },
  };

  (window as unknown as Record<string, unknown>).__miftahDebug = debug;
  console.log("[PWA Debug] Tools available: window.__miftahDebug.downloadSurah(id), .cancelDownload(), .listPacks()");
}
