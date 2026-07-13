// src/lib/hifz/page-words.ts
import type { MushafLayoutPage } from '@/mushaf/types/mushafLayout';
import type { PageWord, AyahWordRange } from './types';

function parseLocation(location: string): {
  surah: number;
  ayah: number;
  wordPosition: number;
} {
  const parts = location.split(':');
  return {
    surah: Number(parts[0]),
    ayah: Number(parts[1]),
    wordPosition: Number(parts[2]),
  };
}

export function getPageWords(layout: MushafLayoutPage): PageWord[] {
  return layout.lines
    .filter((line) => line.type === 'text')
    .flatMap((line) =>
      (line.words ?? []).map((w) => {
        const parsed = parseLocation(w.location);
        return {
          location: w.location,
          surah: parsed.surah,
          ayah: parsed.ayah,
          wordPosition: parsed.wordPosition,
          text: w.word,
          qpcV2: w.qpcV2,
        };
      }),
    );
}

export function buildAyahWordRanges(words: PageWord[]): AyahWordRange[] {
  if (words.length === 0) return [];

  const ranges: AyahWordRange[] = [];
  let currentKey = `${words[0].surah}:${words[0].ayah}`;
  let startIndex = 0;

  for (let i = 1; i <= words.length; i++) {
    const nextKey =
      i < words.length ? `${words[i].surah}:${words[i].ayah}` : null;

    if (nextKey !== currentKey) {
      const w = words[startIndex];
      ranges.push({
        surah: w.surah,
        ayah: w.ayah,
        ayahKey: currentKey,
        startWordIndex: startIndex,
        endWordIndex: i - 1,
      });
      if (nextKey !== null) {
        currentKey = nextKey;
        startIndex = i;
      }
    }
  }

  return ranges;
}
