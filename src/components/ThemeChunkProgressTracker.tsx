"use client";

import { useEffect, useRef } from "react";

interface ThemeChunkProgressTrackerProps {
  chunkIndex: number;
  surahId: number;
}

const MIN_ACTIVE_MS = 10_000;
const MIN_SCROLL_RATIO = 0.65;
const POLL_MS = 1_000;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

async function postThemeProgress(
  surahId: number,
  chunkIndex: number,
  status: "started" | "completed",
): Promise<void> {
  await fetch("/api/theme/progress", {
    body: JSON.stringify({
      chunkIndex,
      status,
      surahId,
    }),
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
  });
}

export function ThemeChunkProgressTracker({
  chunkIndex,
  surahId,
}: ThemeChunkProgressTrackerProps) {
  const startedAtRef = useRef<number | null>(null);
  const completedRef = useRef(false);
  const maxScrollRatioRef = useRef(0);

  useEffect(() => {
    startedAtRef.current = Date.now();
    completedRef.current = false;
    maxScrollRatioRef.current = 0;
    void postThemeProgress(surahId, chunkIndex, "started");

    const handleScroll = () => {
      const maxScrollable = Math.max(
        1,
        document.documentElement.scrollHeight - window.innerHeight,
      );
      const current = clamp(window.scrollY / maxScrollable, 0, 1);
      maxScrollRatioRef.current = Math.max(maxScrollRatioRef.current, current);
    };

    const completeIfReady = () => {
      if (completedRef.current) {
        return;
      }
      if (document.visibilityState === "hidden") {
        return;
      }

      const startedAt = startedAtRef.current;
      if (!startedAt) {
        return;
      }

      const elapsed = Date.now() - startedAt;
      if (elapsed < MIN_ACTIVE_MS) {
        return;
      }
      if (maxScrollRatioRef.current < MIN_SCROLL_RATIO) {
        return;
      }

      completedRef.current = true;
      void postThemeProgress(surahId, chunkIndex, "completed");
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleScroll);
    handleScroll();

    const timer = window.setInterval(completeIfReady, POLL_MS);
    const visibilityHandler = () => {
      if (document.visibilityState === "visible") {
        completeIfReady();
      }
    };
    document.addEventListener("visibilitychange", visibilityHandler);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
      document.removeEventListener("visibilitychange", visibilityHandler);
      completeIfReady();
    };
  }, [chunkIndex, surahId]);

  return null;
}
