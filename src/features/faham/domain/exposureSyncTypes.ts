import type { FahamExposureInput } from "./types";

export interface PendingFahamExposureEvent {
  ayahKey: string;
  id: string;
  lastErrorAt: number | null;
  nextRetryAt: number;
  payload: FahamExposureInput;
  queuedAt: number;
  retryCount: number;
  sourceKey: string;
}

export interface FahamExposureSignal {
  ayahIds: number[];
  pageNumber?: number;
  queuedAt: number;
  sourceKey: string;
  sourceType: "reading_page" | "theme_chunk" | "hifz_ayah";
  surahId?: number | null;
  themeChunkIndex?: number;
}
