"use client";

import { useEffect } from "react";
import { setupReadingStateSync } from "@/lib/pwa/readingStateSync";

export function ReadingStateSync() {
  useEffect(() => {
    setupReadingStateSync();
  }, []);
  return null;
}
