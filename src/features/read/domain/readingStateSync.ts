"use client";

import { loadReadingProgress } from "./readingProgressStorage";

let syncSetUp = false;

async function flushReadingState(): Promise<void> {
  const state = loadReadingProgress();
  if (!state.lastPage) return;

  try {
    const response = await fetch("/api/reading/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state),
    });
    if (!response.ok) {
      console.warn(`[Reading Sync] Server returned ${response.status} — will retry on next reconnect`);
    }
  } catch (error) {
    console.warn("[Reading Sync] Network error — will retry on next reconnect", error);
  }
}

export function setupReadingStateSync(): void {
  if (typeof window === "undefined" || syncSetUp) return;
  syncSetUp = true;
  window.addEventListener("online", flushReadingState);
}
