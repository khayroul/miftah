"use client";

import { loadReadingProgress } from "@/lib/readingProgressStorage";

let syncSetUp = false;

async function flushReadingState(): Promise<void> {
  const state = loadReadingProgress();
  if (!state.lastPage) return;

  try {
    await fetch("/api/reading/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state),
    });
  } catch {
    // Will retry on next online event
  }
}

export function setupReadingStateSync(): void {
  if (typeof window === "undefined" || syncSetUp) return;
  syncSetUp = true;
  window.addEventListener("online", flushReadingState);
}
