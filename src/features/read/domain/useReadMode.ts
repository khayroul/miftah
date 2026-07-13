"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  defaultReadMode,
  loadReadMode,
  saveReadMode,
  subscribeReadMode,
  type ReadMode,
} from "./readMode";

export function useReadMode(): {
  mode: ReadMode;
  setMode: (nextMode: ReadMode) => void;
} {
  const mode = useSyncExternalStore(subscribeReadMode, loadReadMode, defaultReadMode);

  const setMode = useCallback((nextMode: ReadMode) => {
    saveReadMode(nextMode);
  }, []);

  return {
    mode,
    setMode,
  };
}
