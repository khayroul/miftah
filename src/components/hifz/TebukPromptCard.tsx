"use client";

import type { TebukPrompt } from "@/types/hifz-exercises";

interface TebukPromptCardProps {
  prompt: TebukPrompt;
  pageNumber: number;
  roundNumber: number;
  totalRounds: number;
  isRevealed: boolean;
  onReplay: () => void;
}

export function TebukPromptCard({
  prompt,
  pageNumber,
  roundNumber,
  totalRounds,
  isRevealed,
  onReplay,
}: TebukPromptCardProps) {
  const qcfFamily = `"QCF2 P${String(pageNumber).padStart(3, "0")}"`;
  const glyphs = prompt.promptWords.map((w) => w.qpcV2).join("");

  return (
    <div className="rounded-2xl border border-stone-200 bg-white shadow-sm dark:border-stone-700 dark:bg-stone-900">
      {/* Round indicator */}
      <div className="flex items-center justify-between border-b border-stone-100 px-5 py-3 dark:border-stone-800">
        <span className="text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">
          Tebuk {roundNumber}/{totalRounds}
        </span>
        {isRevealed && (
          <span className="text-xs text-stone-500 dark:text-stone-400">
            Surah {prompt.surah} : Ayat {prompt.ayah}
          </span>
        )}
      </div>

      {/* QCF glyph display */}
      <div className="px-5 py-6">
        <p className="text-center text-sm text-stone-500 dark:text-stone-400 mb-3">
          Sambung selepas 4 perkataan ini:
        </p>
        <div
          dir="rtl"
          lang="ar"
          className="text-center text-4xl leading-loose"
          style={{ fontFamily: qcfFamily }}
        >
          {glyphs}
        </div>
      </div>

      {/* Replay button */}
      <div className="flex justify-center border-t border-stone-100 px-5 py-3 dark:border-stone-800">
        <button
          type="button"
          onClick={onReplay}
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-stone-600 transition hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800"
        >
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M8 5v14l11-7z" />
          </svg>
          Ulang dengar
        </button>
      </div>
    </div>
  );
}
