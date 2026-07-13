import type { OptionalOfflineCacheHooks } from "@/shared/pwa";
import {
  clearCachedFahamTierVocabPackage,
  getFahamTierVocabPackageMarker,
  prefetchFahamTierVocabPackage,
} from "./domain/tierVocabPackage";

/** Feature-owned adapter injected by app-level client coordinators. */
export const FAHAM_PWA_CACHE_HOOKS: OptionalOfflineCacheHooks = Object.freeze({
  clear: clearCachedFahamTierVocabPackage,
  getMarker: getFahamTierVocabPackageMarker,
  prefetch: prefetchFahamTierVocabPackage,
});
