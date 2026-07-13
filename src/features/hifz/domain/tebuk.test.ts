import { describe, it, expect, vi } from 'vitest';
import { pickTebukPrompts } from './tebuk';
import type { MushafLayoutPage } from '@/mushaf/types/mushafLayout';

// Page with 3 ayahs: ayah 2:1 (1 word — too short), 2:2 (6 words), 2:3 (5 words)
const MOCK_LAYOUT: MushafLayoutPage = {
  page: 2,
  lines: [
    { line: 1, type: 'surah-header', text: 'سورة البقرة', surah: '002' },
    { line: 2, type: 'basmala', qpcV2: 'ﭑﭒﭓ' },
    {
      line: 3, type: 'text', verseRange: '2:1-2:2',
      words: [
        { location: '2:1:1', word: 'الٓمٓ', qpcV2: 'ﱁ' },
        { location: '2:2:1', word: 'ذَٰلِكَ', qpcV2: 'ﱃ' },
        { location: '2:2:2', word: 'ٱلْكِتَـٰبُ', qpcV2: 'ﱄ' },
        { location: '2:2:3', word: 'لَا', qpcV2: 'ﱅ' },
        { location: '2:2:4', word: 'رَيْبَ', qpcV2: 'ﱆ' },
      ],
    },
    {
      line: 4, type: 'text', verseRange: '2:2-2:3',
      words: [
        { location: '2:2:5', word: 'فِيهِ', qpcV2: 'ﱈ' },
        { location: '2:2:6', word: 'هُدًۭى', qpcV2: 'ﱉ' },
        { location: '2:3:1', word: 'ٱلَّذِينَ', qpcV2: 'ﱊ' },
        { location: '2:3:2', word: 'يُؤْمِنُونَ', qpcV2: 'ﱋ' },
        { location: '2:3:3', word: 'بِٱلْغَيْبِ', qpcV2: 'ﱌ' },
        { location: '2:3:4', word: 'وَيُقِيمُونَ', qpcV2: 'ﱍ' },
        { location: '2:3:5', word: 'ٱلصَّلَوٰةَ', qpcV2: 'ﱎ' },
      ],
    },
  ],
};

describe('pickTebukPrompts', () => {
  it('returns prompts only from ayahs with >= 5 words', () => {
    const prompts = pickTebukPrompts(MOCK_LAYOUT, 3);
    expect(prompts.length).toBeLessThanOrEqual(2);
    expect(prompts.every(p => p.promptWords.length === 4)).toBe(true);
  });

  it('each prompt has 4 words', () => {
    const prompts = pickTebukPrompts(MOCK_LAYOUT, 2);
    for (const p of prompts) {
      expect(p.promptWords).toHaveLength(4);
    }
  });

  it('prompts come from different ayahs', () => {
    const prompts = pickTebukPrompts(MOCK_LAYOUT, 2);
    if (prompts.length >= 2) {
      const ayahKeys = prompts.map(p => `${p.surah}:${p.ayah}`);
      expect(new Set(ayahKeys).size).toBe(ayahKeys.length);
    }
  });

  it('continuation text is non-empty and capped at 20 words', () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.999999);

    try {
      const prompts = pickTebukPrompts(MOCK_LAYOUT, 2);
      const finalAyahPrompt = prompts.find(p => p.ayah === 3);

      expect(finalAyahPrompt).toBeDefined();
      expect(finalAyahPrompt?.startWordIdx).toBe(0);
      expect(finalAyahPrompt?.continuationText.length).toBeGreaterThan(0);
      expect(prompts.every(p => p.continuationText.length > 0)).toBe(true);
      for (const prompt of prompts) {
        const wordCount = prompt.continuationText.split(' ').filter(w => w.length > 0).length;
        expect(wordCount).toBeLessThanOrEqual(20);
      }
    } finally {
      random.mockRestore();
    }
  });

  it('continuationAyahKeys includes the prompt ayah', () => {
    const prompts = pickTebukPrompts(MOCK_LAYOUT, 1);
    const key = `${prompts[0].surah}:${prompts[0].ayah}`;
    expect(prompts[0].continuationAyahKeys).toContain(key);
  });

  it('reduces count if page has fewer eligible ayahs', () => {
    const prompts = pickTebukPrompts(MOCK_LAYOUT, 3);
    expect(prompts.length).toBeLessThanOrEqual(2);
  });
});
