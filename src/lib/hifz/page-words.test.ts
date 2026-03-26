// src/lib/hifz/page-words.test.ts
import { describe, it, expect } from 'vitest';
import { getPageWords, buildAyahWordRanges } from './page-words';
import type { MushafLayoutPage } from '@/types/mushafLayout';

const MOCK_LAYOUT: MushafLayoutPage = {
  page: 2,
  lines: [
    { line: 1, type: 'surah-header', text: 'سورة البقرة', surah: '002' },
    { line: 2, type: 'basmala', qpcV2: 'ﭑﭒﭓ' },
    {
      line: 3,
      type: 'text',
      text: 'الٓمٓ ذَٰلِكَ ٱلْكِتَـٰبُ لَا رَيْبَ',
      verseRange: '2:1-2:2',
      words: [
        { location: '2:1:1', word: 'الٓمٓ', qpcV2: 'ﱁ' },
        { location: '2:2:1', word: 'ذَٰلِكَ', qpcV2: 'ﱃ' },
        { location: '2:2:2', word: 'ٱلْكِتَـٰبُ', qpcV2: 'ﱄ' },
        { location: '2:2:3', word: 'لَا', qpcV2: 'ﱅ' },
        { location: '2:2:4', word: 'رَيْبَ', qpcV2: 'ﱆ' },
      ],
    },
    {
      line: 4,
      type: 'text',
      text: 'فِيهِ هُدًۭى لِّلْمُتَّقِينَ',
      verseRange: '2:2',
      words: [
        { location: '2:2:5', word: 'فِيهِ', qpcV2: 'ﱈ' },
        { location: '2:2:6', word: 'هُدًۭى', qpcV2: 'ﱉ' },
        { location: '2:3:1', word: 'لِّلْمُتَّقِينَ', qpcV2: 'ﱊ' },
      ],
    },
  ],
};

describe('getPageWords', () => {
  it('returns words from text lines only, skipping surah-header and basmala', () => {
    const words = getPageWords(MOCK_LAYOUT);
    expect(words).toHaveLength(8);
    expect(words[0].location).toBe('2:1:1');
    expect(words[7].location).toBe('2:3:1');
  });

  it('parses surah, ayah, wordPosition from location string', () => {
    const words = getPageWords(MOCK_LAYOUT);
    expect(words[1]).toMatchObject({ surah: 2, ayah: 2, wordPosition: 1 });
    expect(words[7]).toMatchObject({ surah: 2, ayah: 3, wordPosition: 1 });
  });

  it('preserves text and qpcV2 from layout', () => {
    const words = getPageWords(MOCK_LAYOUT);
    expect(words[0].text).toBe('الٓمٓ');
    expect(words[0].qpcV2).toBe('ﱁ');
  });

  it('returns empty array for page with no text lines', () => {
    const emptyLayout: MushafLayoutPage = {
      page: 1,
      lines: [{ line: 1, type: 'surah-header', text: 'سورة الفاتحة', surah: '001' }],
    };
    expect(getPageWords(emptyLayout)).toEqual([]);
  });
});

describe('buildAyahWordRanges', () => {
  it('groups consecutive words by ayah with correct flat indices', () => {
    const words = getPageWords(MOCK_LAYOUT);
    const ranges = buildAyahWordRanges(words);

    expect(ranges).toHaveLength(3);
    expect(ranges[0]).toMatchObject({
      surah: 2, ayah: 1, ayahKey: '2:1',
      startWordIndex: 0, endWordIndex: 0,
    });
    expect(ranges[1]).toMatchObject({
      surah: 2, ayah: 2, ayahKey: '2:2',
      startWordIndex: 1, endWordIndex: 6,
    });
    expect(ranges[2]).toMatchObject({
      surah: 2, ayah: 3, ayahKey: '2:3',
      startWordIndex: 7, endWordIndex: 7,
    });
  });

  it('returns empty array for empty words', () => {
    expect(buildAyahWordRanges([])).toEqual([]);
  });
});
