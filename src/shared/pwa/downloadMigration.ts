import {
  clearCachedFahamTierVocabPackage,
  getFahamTierVocabPackageMarker,
} from "@/features/faham/client";
import {
  CACHE_BUNDLE,
  CACHE_DATA,
  CACHE_IMAGES,
  CACHE_TEMA,
} from "./offlineBundle";
import {
  LS_KEY_DOWNLOADED,
  clearMushafDownloaded,
  parseDownloadedMarker,
} from "./mushafStatus";
import { clearDownloadCheckpoint } from "./downloadPackages";

export async function migrateIfVersionChanged(
  cdnAssetVersion: string,
  temaDataVersion: string,
  fahamDataVersion: string,
  appBuildId: string,
): Promise<void> {
  const stored = localStorage.getItem(LS_KEY_DOWNLOADED);
  if (stored === null) return;
  const parsed = parseDownloadedMarker(stored);

  if (!parsed) {
    clearMushafDownloaded();
    clearDownloadCheckpoint();
    return;
  }

  if (parsed.cdnAssetVersion !== cdnAssetVersion) {
    await caches.delete(CACHE_IMAGES);
    await caches.delete(CACHE_DATA);
    await caches.delete(CACHE_BUNDLE);
    await clearCachedFahamTierVocabPackage();
    clearMushafDownloaded();
    clearDownloadCheckpoint();
    return;
  }

  if (parsed.temaDataVersion !== temaDataVersion) {
    await caches.delete(CACHE_TEMA);
    await clearCachedFahamTierVocabPackage();
    clearMushafDownloaded();
    clearDownloadCheckpoint();
    await caches.delete(CACHE_BUNDLE);
    return;
  }

  if (parsed.schemaVersion !== "2") {
    await clearCachedFahamTierVocabPackage();
    clearMushafDownloaded();
    clearDownloadCheckpoint();
  }

  if (parsed.appBuildId !== appBuildId) {
    await clearCachedFahamTierVocabPackage();
    await caches.delete(CACHE_BUNDLE);
    clearMushafDownloaded();
    clearDownloadCheckpoint();
  }

  const tierMarker = getFahamTierVocabPackageMarker();
  if (
    tierMarker !== null &&
    (tierMarker.dataVersion !== fahamDataVersion || tierMarker.appBuildId !== appBuildId)
  ) {
    await clearCachedFahamTierVocabPackage();
  }
}
