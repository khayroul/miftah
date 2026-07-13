import type { MushafLayoutPage } from '@/mushaf/types/mushafLayout';
import type { TebukPrompt, PageWord } from '@/types/hifz-exercises';
import { getPageWords } from './page-words';
import { normalizeArabic } from '../tasmi/arabic-normalizer';

const PROMPT_WORD_COUNT = 4;
const MIN_AYAH_WORDS = 5;
const MAX_CONTINUATION_WORDS = 20;

interface AyahGroup {
  surah: number;
  ayah: number;
  words: PageWord[];
  startIndex: number;
}

function groupWordsByAyah(words: PageWord[]): AyahGroup[] {
  const groups: AyahGroup[] = [];
  let current: AyahGroup | null = null;

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const key = `${w.surah}:${w.ayah}`;
    const currentKey = current ? `${current.surah}:${current.ayah}` : null;

    if (key !== currentKey) {
      current = { surah: w.surah, ayah: w.ayah, words: [w], startIndex: i };
      groups.push(current);
    } else {
      current!.words = [...current!.words, w];
    }
  }

  return groups;
}

function shuffleArray<T>(arr: readonly T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function pickTebukPrompts(
  layout: MushafLayoutPage,
  count: number,
): TebukPrompt[] {
  const allWords = getPageWords(layout);
  const groups = groupWordsByAyah(allWords);
  const eligible = groups.filter((g) => g.words.length >= MIN_AYAH_WORDS);

  const shuffled = shuffleArray(eligible);
  const selected = shuffled.slice(0, count);

  return selected.map((group) => {
    const maxStart = group.words.length - PROMPT_WORD_COUNT;
    const startIdx = Math.floor(Math.random() * (maxStart + 1));

    const promptWords = group.words.slice(startIdx, startIdx + PROMPT_WORD_COUNT);

    const restOfAyah = group.words.slice(startIdx + PROMPT_WORD_COUNT);
    const groupIndex = groups.indexOf(group);
    const subsequentWords = groups
      .slice(groupIndex + 1)
      .flatMap((g) => g.words);

    const allContinuation = [...restOfAyah, ...subsequentWords];
    const cappedContinuation = allContinuation.slice(0, MAX_CONTINUATION_WORDS);

    const continuationText = normalizeArabic(
      cappedContinuation.map((w) => w.text).join(' '),
    );

    const continuationAyahKeys = [
      ...new Set(cappedContinuation.map((w) => `${w.surah}:${w.ayah}`)),
    ];
    const promptAyahKey = `${group.surah}:${group.ayah}`;
    if (!continuationAyahKeys.includes(promptAyahKey)) {
      continuationAyahKeys.unshift(promptAyahKey);
    }

    return {
      surah: group.surah,
      ayah: group.ayah,
      startWordIdx: startIdx,
      promptWords,
      continuationText,
      continuationAyahKeys,
    };
  });
}
