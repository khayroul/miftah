/** Stable type-only root for PWA infrastructure. Runtime APIs use named subpaths. */
export type { PageAssetUrls, PwaConfig } from "./downloadConfig";
export type {
  DownloadPackageDefinition,
  DownloadPackageId,
  MushafDownloadProgress,
} from "./downloadPackages";
export type {
  OptionalOfflineCacheHooks,
  OptionalOfflineCacheMarker,
  OptionalOfflineCachePrefetchParams,
} from "./optionalCacheHooks";
