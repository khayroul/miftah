"use client";

import { useEffect, useMemo, useRef } from "react";
import { normalizeArabic } from "../domain/arabic-normalizer";

/**
 * Live word-follow display for a Tasmi' session (Mode A core).
 *
 * Renders the expected range's Uthmani text and highlights it as the reciter
 * progresses: recited words fill in, the next expected word pulses, error
 * positions tint rose. Follows the phrase-level engine — the highlight
 * advances per verified chunk, not per spoken syllable.
 *
 * Index alignment: the matcher tokenizes `normalizeArabic(text)`, so a display
 * token maps to a matcher index only if its own normalized form is non-empty.
 * Decorative signs (ayah markers etc.) whose normalization is empty get no
 * matcher index and are rendered dimmed, never highlighted.
 */

interface TasmiTextFollowProps {
  /** Expected Quran text (uthmani) for the recitation range */
  expectedText: string;
  /** Matcher cursor — positions 0..followIndex have been recited */
  followIndex: number;
  /** Matcher positions flagged as errors (omission/substitution) */
  errorPositions: ReadonlySet<number>;
}

export interface DisplayWord {
  text: string;
  /** Matcher position this token occupies, or null for decorative signs */
  matcherIndex: number | null;
}

/** Exported for the display↔matcher index-alignment boundary test. */
export function buildDisplayWords(expectedText: string): DisplayWord[] {
  const rawTokens = expectedText.split(/\s+/).filter(w => w.length > 0);
  let matcherIndex = 0;
  return rawTokens.map(text => {
    const survives = normalizeArabic(text).length > 0;
    return { text, matcherIndex: survives ? matcherIndex++ : null };
  });
}

function wordClass(
  word: DisplayWord,
  followIndex: number,
  errorPositions: ReadonlySet<number>,
): string {
  if (word.matcherIndex === null) {
    return "text-stone-400 dark:text-stone-500";
  }
  const isError = errorPositions.has(word.matcherIndex);
  const isRecited = word.matcherIndex <= followIndex;
  const isCurrent = word.matcherIndex === followIndex + 1;

  if (isError) {
    // An error position stays visibly marked whether or not the cursor passed it.
    return "rounded bg-rose-100 px-0.5 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300";
  }
  if (isRecited) {
    return "text-teal-700 dark:text-teal-300";
  }
  if (isCurrent) {
    return "animate-pulse rounded bg-amber-100 px-0.5 text-stone-900 dark:bg-amber-900/40 dark:text-stone-100";
  }
  return "text-stone-400 dark:text-stone-500";
}

export function TasmiTextFollow({
  expectedText,
  followIndex,
  errorPositions,
}: TasmiTextFollowProps) {
  const words = useMemo(() => buildDisplayWords(expectedText), [expectedText]);
  const currentRef = useRef<HTMLSpanElement | null>(null);

  // Keep the current word in view as the reciter advances through a long range.
  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [followIndex]);

  return (
    <div
      dir="rtl"
      lang="ar"
      className="max-h-44 w-full overflow-y-auto rounded-xl bg-white/70 px-4 py-3 text-center text-2xl leading-[2.4] dark:bg-stone-900/40"
      style={{ fontFamily: "var(--font-arabic)" }}
    >
      {words.map((word, i) => (
        <span
          key={i}
          ref={word.matcherIndex === followIndex + 1 ? currentRef : undefined}
          className={`transition-colors duration-300 ${wordClass(word, followIndex, errorPositions)}`}
        >
          {word.text}
          {i < words.length - 1 ? " " : ""}
        </span>
      ))}
    </div>
  );
}
