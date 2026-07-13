"use client";

import { useEffect } from "react";

export function FahamPwaDebugLoader() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;

    void Promise.all([
      import("@/shared/pwa/debugTools"),
      import("../pwaCacheHooks"),
    ]).then(([{ installDebugTools }, { FAHAM_PWA_CACHE_HOOKS }]) => {
      installDebugTools(FAHAM_PWA_CACHE_HOOKS);
    });
  }, []);

  return null;
}
