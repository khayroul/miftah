// src/lib/hifz/progressive-unveil.ts
import type { MushafLayoutPage } from '@/types/mushafLayout';
import type { MushafPageManifest, MushafWordHitbox } from '@/types/mushaf';
import { getPageWords } from './page-words';

export interface UnveilWord {
  index: number;
  location: string;
  surah: number;
  ayah: number;
  wordPosition: number;
  hitbox: MushafWordHitbox;
}

export interface UnveilState {
  words: UnveilWord[];
  revealedUpTo: number;
  totalWords: number;
}

export function buildUnveilState(
  layout: MushafLayoutPage,
  manifest: MushafPageManifest,
): UnveilState {
  const pageWords = getPageWords(layout);
  const hitboxMap = new Map(
    manifest.words.map((w) => [w.location, w]),
  );

  let index = 0;
  const words: UnveilWord[] = [];

  for (const pw of pageWords) {
    const hitbox = hitboxMap.get(pw.location);
    if (!hitbox) continue;

    words.push({
      index,
      location: pw.location,
      surah: pw.surah,
      ayah: pw.ayah,
      wordPosition: pw.wordPosition,
      hitbox,
    });
    index++;
  }

  return { words, revealedUpTo: -1, totalWords: words.length };
}

export function revealUpTo(
  state: UnveilState,
  wordIndex: number,
): UnveilState {
  const clampedIndex = Math.max(state.revealedUpTo, wordIndex);
  return { ...state, revealedUpTo: clampedIndex };
}
