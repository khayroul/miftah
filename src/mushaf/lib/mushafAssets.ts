/**
 * Stable server-side facade for Mushaf assets.
 *
 * Keep consumers on this path while URL policy, filesystem lookup, and
 * manifest normalization remain isolated behind cohesive internal modules.
 */
export {
  getAyahImageClientSrc,
  getPageImageClientSrc,
  getQuranWordAudioUrl,
  getRemoteAyahImageUrl,
  getRemotePageImageUrl,
  getRemoteWordImageUrl,
  getWordImageClientSrc,
} from "./mushafAssetUrls";
export type { MushafPageImageSource, PageVariant } from "./mushafAssetUrls";

export {
  ayahImageExists,
  pageImageExists,
  resolveAyahImagePath,
  resolveAyahImageSource,
  resolvePageImagePath,
  resolvePageImageSource,
  resolveWordImagePath,
  resolveWordImageSource,
  wordImageExists,
} from "./mushafAssetFiles";

export { loadAyahManifest, loadPageManifest } from "./mushafManifests";
