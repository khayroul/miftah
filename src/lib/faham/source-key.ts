import type { FahamExposureInput } from "./types";

export function buildFahamSourceKey(input: FahamExposureInput): string {
  if (input.sourceType === "reading_page") {
    return `reading-page:${input.pageNumber}`;
  }
  if (input.sourceType === "theme_chunk") {
    return `theme-chunk:${input.surahId}:${input.themeChunkIndex}`;
  }
  return `hifz-ayah:${input.ayahIds[0] ?? "unknown"}`;
}
