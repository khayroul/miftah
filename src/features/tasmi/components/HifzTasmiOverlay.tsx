"use client";

import { useCallback, useRef } from "react";

interface HifzTasmiOverlayProps {
  totalLines: number;
  revealedLines: number;
  onTap: () => void;
  onRevealTo?: (lines: number) => void;
}

export function HifzTasmiOverlay({
  totalLines,
  revealedLines,
  onTap,
  onRevealTo,
}: HifzTasmiOverlayProps) {
  const safeTotal = Math.max(totalLines, 1);
  const revealPct = (revealedLines / safeTotal) * 100;

  const touchStartYRef = useRef<number | null>(null);
  const touchStartRevealedRef = useRef(revealedLines);
  const containerRef = useRef<HTMLButtonElement | null>(null);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      touchStartYRef.current = e.touches[0]?.clientY ?? null;
      touchStartRevealedRef.current = revealedLines;
    },
    [revealedLines],
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (touchStartYRef.current === null || !onRevealTo || !containerRef.current) return;
      const currentY = e.touches[0]?.clientY ?? 0;
      const deltaY = currentY - touchStartYRef.current;

      const containerHeight = containerRef.current.getBoundingClientRect().height;
      if (containerHeight <= 0) return;

      const lineDelta = Math.round((Math.abs(deltaY) / containerHeight) * safeTotal);
      if (deltaY > 0) {
        // Swipe down → reveal more
        const targetLines = Math.min(touchStartRevealedRef.current + lineDelta, safeTotal);
        if (targetLines !== revealedLines) onRevealTo(targetLines);
      } else if (deltaY < 0) {
        // Swipe up → hide (push veil back up)
        const targetLines = Math.max(touchStartRevealedRef.current - lineDelta, 0);
        if (targetLines !== revealedLines) onRevealTo(targetLines);
      }
    },
    [onRevealTo, revealedLines, safeTotal],
  );

  const handleTouchEnd = useCallback(() => {
    touchStartYRef.current = null;
  }, []);

  return (
    <button
      ref={containerRef}
      type="button"
      onClick={onTap}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="absolute inset-0 z-30 cursor-pointer touch-none rounded-2xl focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-teal-500"
      aria-label="Leret ke bawah atau ketik untuk membuka teks. Leret ke atas untuk menutup semula."
    >
      {/* Dark overlay — shrinks from top as lines are revealed */}
      <div
        className="absolute inset-x-0 bottom-0 bg-stone-900/85 backdrop-blur-sm transition-all duration-300 ease-out dark:bg-stone-950/90"
        style={{ top: `${revealPct}%` }}
      />

      {/* Drag handle at reveal edge */}
      {revealPct > 0 && revealPct < 100 ? (
        <div
          className="absolute inset-x-0 flex justify-center"
          style={{ top: `${revealPct}%`, transform: "translateY(-6px)" }}
        >
          <div className="h-1 w-12 rounded-full bg-white/40" />
        </div>
      ) : null}

      {/* Prompt — positioned in the covered area */}
      <div
        className="absolute inset-x-0 bottom-0 flex items-center justify-center"
        style={{ top: `${revealPct}%` }}
      >
        <div className="flex flex-col items-center gap-3 px-6 text-center">
          <div className="rounded-full bg-white/10 p-4 backdrop-blur-sm">
            <svg
              className="h-8 w-8 text-white/80"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.042 21.672L13.684 16.6m0 0l-2.51 2.225.569-9.47 5.227 7.917-3.286-.672zM12 2.25V4.5m5.834.166l-1.591 1.591M20.25 10.5H18M7.757 14.743l-1.59 1.59M6 10.5H3.75m4.007-4.243l-1.59-1.59"
              />
            </svg>
          </div>
          <p className="text-lg font-semibold text-white/90">
            Leret ke bawah atau ketik untuk buka
          </p>
          <p className="text-sm text-white/60">
            Baca dari ingatan, kemudian semak
          </p>
          <p className="mt-1 text-xs text-white/50">
            Baris {revealedLines}/{totalLines}
          </p>
        </div>
      </div>
    </button>
  );
}
