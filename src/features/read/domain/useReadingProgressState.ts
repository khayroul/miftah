"use client";

import { useSyncExternalStore } from "react";
import {
  getReadingProgressServerSnapshot,
  getReadingProgressSnapshot,
  subscribeReadingProgress,
  type ReadingProgressState,
} from "./readingProgressStorage";

export function useReadingProgressState(): ReadingProgressState {
  return useSyncExternalStore(
    subscribeReadingProgress,
    getReadingProgressSnapshot,
    getReadingProgressServerSnapshot,
  );
}
