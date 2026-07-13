"use client";

import { useEffect } from "react";
import type { OptionalOfflineCacheHooks } from "../optionalCacheHooks";

export function PwaDebugLoader({
  optionalCache,
}: {
  readonly optionalCache?: OptionalOfflineCacheHooks;
}) {
  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      import("../debugTools").then(({ installDebugTools }) => {
        installDebugTools(optionalCache);
      });
    }
  }, [optionalCache]);
  return null;
}
