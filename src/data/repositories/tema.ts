/** Stable public repository surface for Tema reads and progress writes. */
export { themeChunkContentKeyFromChunks } from "./tema-chunks";
export {
  markThemeChunkProgress,
  resolveThemeChunkContentKey,
} from "./tema-progress";
export { getThemeAppearanceChunksBySurah } from "./tema-read";
export type {
  ThemeAppearanceAyah,
  ThemeAppearanceChunk,
  ThemeChunkContentKey,
} from "./tema-types";
