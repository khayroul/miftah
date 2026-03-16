import type { MushafLayoutWord } from "@/types/mushafLayout";

export interface SplitGlyphs {
  prefix: string[];
  core: string;
  suffix: string[];
}

export function splitWordGlyphs(word: MushafLayoutWord): SplitGlyphs {
  const g = word.qpcV2 || "";
  const wordStr = word.word || "";
  const safeG = g.replace(/ /g, "\u00A0");

  const hasHizb = wordStr.includes("\u06DE");
  const hasSajdah = wordStr.includes("\u06E9");
  const hasAyahNum = /[\u0660-\u0669]+$/.test(wordStr);

  const chars = Array.from(safeG);
  let leftIdx = 0;
  let rightIdx = chars.length - 1;

  const prefixParts: string[] = [];
  if (hasHizb && chars.length > 0) {
    prefixParts.push(chars[leftIdx]);
    leftIdx++;
    while (leftIdx <= rightIdx && chars[leftIdx] === "\u00A0") {
      prefixParts.push(chars[leftIdx]);
      leftIdx++;
    }
  }

  const suffixParts: string[] = [];
  let trailingSignsCount = 0;
  if (hasAyahNum) trailingSignsCount++;
  if (hasSajdah) trailingSignsCount++;

  while (trailingSignsCount > 0 && rightIdx >= leftIdx) {
    if (chars[rightIdx] === "\u00A0") {
      suffixParts.unshift(chars[rightIdx]);
      rightIdx--;
    } else {
      suffixParts.unshift(chars[rightIdx]);
      rightIdx--;
      trailingSignsCount--;
    }
  }

  while (rightIdx >= leftIdx && chars[rightIdx] === "\u00A0") {
    suffixParts.unshift(chars[rightIdx]);
    rightIdx--;
  }

  const core = chars.slice(leftIdx, rightIdx + 1).join("");

  return { prefix: prefixParts, core, suffix: suffixParts };
}

export function getAyahKeyFromLocation(location: string): string | null {
  const parts = location.split(":");
  if (parts.length < 2) return null;
  return `${parts[0]}:${parts[1]}`;
}
