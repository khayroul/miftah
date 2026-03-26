"use client";

import { useEffect } from "react";

export function PwaDebugLoader() {
  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      import("@/lib/pwa/debugTools").then(({ installDebugTools }) => {
        installDebugTools();
      });
    }
  }, []);
  return null;
}
