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
import type { OptionalOfflineCacheHooks } from "./optionalCacheHooks";

export async function migrateIfVersionChanged(
  cdnAssetVersion: string,
  temaDataVersion: string,
  optionalCacheDataVersion: string,
  appBuildId: string,
  optionalCache?: OptionalOfflineCacheHooks,
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
    await optionalCache?.clear();
    clearMushafDownloaded();
    clearDownloadCheckpoint();
    return;
  }

  if (parsed.temaDataVersion !== temaDataVersion) {
    await caches.delete(CACHE_TEMA);
    await optionalCache?.clear();
    clearMushafDownloaded();
    clearDownloadCheckpoint();
    await caches.delete(CACHE_BUNDLE);
    return;
  }

  if (parsed.schemaVersion !== "2") {
    await optionalCache?.clear();
    clearMushafDownloaded();
    clearDownloadCheckpoint();
  }

  if (parsed.appBuildId !== appBuildId) {
    await optionalCache?.clear();
    await caches.delete(CACHE_BUNDLE);
    clearMushafDownloaded();
    clearDownloadCheckpoint();
  }

  const tierMarker = optionalCache?.getMarker() ?? null;
  if (
    tierMarker !== null &&
    (tierMarker.dataVersion !== optionalCacheDataVersion ||
      tierMarker.appBuildId !== appBuildId)
  ) {
    await optionalCache?.clear();
  }
}
