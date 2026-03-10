"use client";

import { useEffect, useSyncExternalStore } from "react";
import {
  defaultTheme,
  initializeTheme,
  loadTheme,
  saveTheme,
  subscribeTheme,
  toggleTheme,
  type AppTheme,
} from "@/lib/theme";

export function useTheme(): {
  theme: AppTheme;
  setTheme: (theme: AppTheme) => void;
  toggleTheme: () => void;
} {
  const theme = useSyncExternalStore(subscribeTheme, loadTheme, () => defaultTheme);

  useEffect(() => {
    initializeTheme();
  }, []);

  return {
    theme,
    setTheme: saveTheme,
    toggleTheme,
  };
}
