"use client";

import { useSyncExternalStore } from "react";
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

  return {
    mode,
    setMode: (nextMode: ReadMode) => {
      saveReadMode(nextMode);
    },
  };
}
