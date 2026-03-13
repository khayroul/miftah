"use client";

interface HifzTasmiOverlayProps {
  totalLines: number;
  revealedLines: number;
  onTap: () => void;
}

export function HifzTasmiOverlay({
  totalLines,
  revealedLines,
  onTap,
}: HifzTasmiOverlayProps) {
  // Calculate how much of the mushaf to reveal from the top.
  // revealedLines=0 → cover 100%, revealedLines=totalLines → cover 0%
  const safeTotal = Math.max(totalLines, 1);
  const revealPct = (revealedLines / safeTotal) * 100;

  return (
    <button
      type="button"
      onClick={onTap}
      className="absolute inset-0 z-30 cursor-pointer focus:outline-none"
      aria-label="Ketuk untuk buka baris seterusnya"
    >
      {/* Dark overlay — shrinks from top as lines are revealed */}
      <div
        className="absolute inset-x-0 bottom-0 bg-stone-900/85 backdrop-blur-sm transition-all duration-300 ease-out dark:bg-stone-950/90"
        style={{ top: `${revealPct}%` }}
      />

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
            Ketuk untuk buka baris seterusnya
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
