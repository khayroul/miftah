"use client";

import { useEffect } from "react";
import { setupReadingStateSync } from "@/shared/pwa/readingStateSync";

export function ReadingStateSync() {
  useEffect(() => {
    setupReadingStateSync();
  }, []);
  return null;
}
