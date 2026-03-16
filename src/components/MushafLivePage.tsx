"use client";

import { useEffect, useLayoutEffect, useRef, useCallback } from "react";
import type { MushafLayoutLine, MushafLayoutPage } from "@/types/mushafLayout";
import { computeLastLineFlags } from "@/types/mushafLayout";
import { splitWordGlyphs, getAyahKeyFromLocation } from "@/lib/mushafGlyphs";
import {
  useMushafFont,
  ensureGlobalMushafFonts,
  preloadMushafFont,
  getFontFamily,
} from "@/lib/mushafFonts";

export interface MushafLiveWordRef {
  location: string;
  ayahKey: string | null;
}

interface MushafLivePageProps {
  pageNumber: number;
  layout: MushafLayoutPage;
  onWordClick?: (word: MushafLiveWordRef, element: HTMLElement) => void;
  onWordLongPress?: (word: MushafLiveWordRef) => void;
  activePlaybackAyahKey?: string | null;
  highlightedWordLocation?: string | null;
  revealBoundaryLineIndex?: number | null;
  difficultAyahKeys?: Set<string>;
  onReady?: () => void;
}

function SurahBanner({ surah }: { surah: string }) {
  const surahNum = parseInt(surah || "0", 10);
  const char = String.fromCharCode(0xe000 + surahNum);

  return (
    <div className="mushaf-surah-banner">
      <div className="mushaf-surah-frame">
        <span className="mushaf-surah-title">{char}</span>
      </div>
    </div>
  );
}

function BasmalaLine({
  qpcV2,
  fontFamily,
}: {
  qpcV2: string;
  fontFamily: string;
}) {
  return (
    <div className="mushaf-basmala">
      <span
        className="mushaf-qcf"
        style={{ fontFamily: `'QCF2_BSML', '${fontFamily}', serif` }}
      >
        {qpcV2}
      </span>
    </div>
  );
}

function TextLine({
  line,
  isLastLine,
  fontFamily,
  onWordClick,
  onWordLongPress,
  activePlaybackAyahKey,
  highlightedWordLocation,
  difficultAyahKeys,
}: {
  line: MushafLayoutLine;
  isLastLine: boolean;
  fontFamily: string;
  onWordClick?: (word: MushafLiveWordRef, element: HTMLElement) => void;
  onWordLongPress?: (word: MushafLiveWordRef) => void;
  activePlaybackAyahKey?: string | null;
  highlightedWordLocation?: string | null;
  difficultAyahKeys?: Set<string>;
}) {
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const words = line.words || [];

  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  return (
    <div
      className={`mushaf-text-line${isLastLine ? " mushaf-last-line" : ""}`}
      style={{ fontFamily: `'${fontFamily}', serif` }}
    >
      {words.map((word, i) => {
        const split = splitWordGlyphs(word);
        const ayahKey = getAyahKeyFromLocation(word.location);
        const isPlaying = activePlaybackAyahKey === ayahKey;
        const isHighlighted = highlightedWordLocation === word.location;
        const isDifficultFirst =
          difficultAyahKeys?.has(ayahKey || "") &&
          word.location.endsWith(":1");

        const wordRef: MushafLiveWordRef = {
          location: word.location,
          ayahKey,
        };

        return (
          <span key={`${word.location}-${i}`} className="mushaf-word-group">
            {split.prefix.map((ch, pi) => (
              <span key={`p-${pi}`} className="mushaf-sign">
                {ch}
              </span>
            ))}
            {split.core.length > 0 && (
              <span
                className={`mushaf-word${isPlaying ? " mushaf-word--playing" : ""}${isHighlighted ? " mushaf-word--highlighted" : ""}`}
                data-loc={word.location}
                onClick={(e) => {
                  e.stopPropagation();
                  onWordClick?.(wordRef, e.currentTarget);
                }}
                onPointerDown={() => {
                  clearLongPress();
                  longPressTimerRef.current = setTimeout(() => {
                    onWordLongPress?.(wordRef);
                    longPressTimerRef.current = null;
                  }, 600);
                }}
                onPointerUp={clearLongPress}
                onPointerLeave={clearLongPress}
              >
                {split.core}
                {isDifficultFirst && (
                  <span className="mushaf-difficult-dot" />
                )}
              </span>
            )}
            {split.suffix.map((ch, si) => (
              <span key={`s-${si}`} className="mushaf-sign">
                {ch}
              </span>
            ))}
          </span>
        );
      })}
    </div>
  );
}

export function MushafLivePage({
  pageNumber,
  layout,
  onWordClick,
  onWordLongPress,
  activePlaybackAyahKey,
  highlightedWordLocation,
  revealBoundaryLineIndex,
  difficultAyahKeys,
  onReady,
}: MushafLivePageProps) {
  const { loaded: fontLoaded, fontFamily } = useMushafFont(pageNumber);
  const textAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ensureGlobalMushafFonts();
  }, []);

  useEffect(() => {
    if (pageNumber > 1) preloadMushafFont(pageNumber - 1);
    if (pageNumber < 604) preloadMushafFont(pageNumber + 1);
  }, [pageNumber]);

  // Auto-fit overflow: use scaleX() to compress overflowing lines
  // This keeps text height uniform while slightly narrowing dense lines
  useLayoutEffect(() => {
    if (!fontLoaded || !textAreaRef.current) return;

    const area = textAreaRef.current;

    const fitLine = (line: HTMLElement) => {
      // Reset any previous transform
      line.style.transform = "";

      const groups = Array.from(
        line.querySelectorAll<HTMLElement>(":scope > .mushaf-word-group"),
      );
      if (!groups.length) return;

      const lineRect = line.getBoundingClientRect();
      let minX = Number.POSITIVE_INFINITY;
      let maxX = Number.NEGATIVE_INFINITY;
      for (const group of groups) {
        const r = group.getBoundingClientRect();
        if (r.width <= 0) continue;
        minX = Math.min(minX, r.left);
        maxX = Math.max(maxX, r.right);
      }

      const contentWidth = maxX - minX;
      if (contentWidth <= lineRect.width + 0.5) return; // no overflow

      // Scale down horizontally — min 0.85 to avoid extreme compression
      const scale = Math.max(0.85, lineRect.width / contentWidth);
      line.style.transform = `scaleX(${scale})`;
    };

    area
      .querySelectorAll<HTMLElement>(".mushaf-text-line")
      .forEach(fitLine);

    // Basmala overflow — also use scaleX
    area
      .querySelectorAll<HTMLElement>(".mushaf-basmala")
      .forEach((line) => {
        line.style.transform = "";
        if (line.scrollWidth > line.clientWidth + 1) {
          const scale = Math.max(0.85, line.clientWidth / line.scrollWidth);
          line.style.transform = `scaleX(${scale})`;
        }
      });

    onReady?.();
  }, [fontLoaded, pageNumber, layout, onReady]);

  const isOpeningPage = pageNumber === 1 || pageNumber === 2;
  const isShortPage = !isOpeningPage && layout.lines.length < 15;
  const lastLineFlags = computeLastLineFlags(layout.lines);

  const textAreaClass = [
    "mushaf-text-area",
    isOpeningPage && "mushaf-opening-page",
    isShortPage && "mushaf-short-page",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className="mushaf-page"
      dir="rtl"
      lang="ar"
    >
      <div ref={textAreaRef} className={textAreaClass}>
        {layout.lines.map((line, i) => {
          const isHidden =
            revealBoundaryLineIndex != null && i >= revealBoundaryLineIndex;

          if (line.type === "surah-header") {
            return (
              <div
                key={`sh-${i}`}
                style={isHidden ? { visibility: "hidden" } : undefined}
              >
                <SurahBanner surah={line.surah || "0"} />
              </div>
            );
          }

          if (line.type === "basmala") {
            return (
              <div
                key={`bs-${i}`}
                style={isHidden ? { visibility: "hidden" } : undefined}
              >
                <BasmalaLine
                  qpcV2={line.qpcV2 || ""}
                  fontFamily={fontFamily}
                />
              </div>
            );
          }

          return (
            <div
              key={`tl-${i}`}
              style={isHidden ? { visibility: "hidden" } : undefined}
            >
              <TextLine
                line={line}
                isLastLine={lastLineFlags.has(i)}
                fontFamily={fontFamily}
                onWordClick={onWordClick}
                onWordLongPress={onWordLongPress}
                activePlaybackAyahKey={activePlaybackAyahKey}
                highlightedWordLocation={highlightedWordLocation}
                difficultAyahKeys={difficultAyahKeys}
              />
            </div>
          );
        })}
      </div>
      <div className="mushaf-page-number">
        {pageNumber}
      </div>
    </div>
  );
}
