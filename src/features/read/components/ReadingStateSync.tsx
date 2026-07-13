"use client";

import { useEffect } from "react";
import { setupReadingStateSync } from "../domain/readingStateSync";

export function ReadingStateSync() {
  useEffect(() => {
    setupReadingStateSync();
  }, []);
  return null;
}
