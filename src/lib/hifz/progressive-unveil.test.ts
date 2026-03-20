// src/lib/hifz/progressive-unveil.test.ts
import { describe, it, expect } from 'vitest';
import { buildUnveilState, revealUpTo } from './progressive-unveil';
import type { MushafLayoutPage } from '@/types/mushafLayout';
import type { MushafPageManifest } from '@/types/mushaf';

const MOCK_LAYOUT: MushafLayoutPage = {
  page: 2,
  lines: [
    { line: 1, type: 'surah-header', text: 'سورة البقرة', surah: '002' },
    {
      line: 2, type: 'text', verseRange: '2:1',
      words: [
        { location: '2:1:1', word: 'الٓمٓ', qpcV2: 'ﱁ' },
      ],
    },
    {
      line: 3, type: 'text', verseRange: '2:2',
      words: [
        { location: '2:2:1', word: 'ذَٰلِكَ', qpcV2: 'ﱃ' },
        { location: '2:2:2', word: 'ٱلْكِتَـٰبُ', qpcV2: 'ﱄ' },
      ],
    },
  ],
};

const MOCK_MANIFEST: MushafPageManifest = {
  page: 2,
  schema_version: '1.0',
  image_width: 1200,
  image_height: 1800,
  words: [
    { location: '2:1:1', x: 900, y: 100, width: 200, height: 60 },
    { location: '2:2:1', x: 800, y: 200, width: 180, height: 60 },
    { location: '2:2:2', x: 600, y: 200, width: 190, height: 60 },
  ],
};

describe('buildUnveilState', () => {
  it('creates state with correct word count (only words with hitboxes)', () => {
    const state = buildUnveilState(MOCK_LAYOUT, MOCK_MANIFEST);
    expect(state.totalWords).toBe(3);
    expect(state.words).toHaveLength(3);
    expect(state.revealedUpTo).toBe(-1);
  });

  it('preserves reading order', () => {
    const state = buildUnveilState(MOCK_LAYOUT, MOCK_MANIFEST);
    expect(state.words[0].location).toBe('2:1:1');
    expect(state.words[1].location).toBe('2:2:1');
    expect(state.words[2].location).toBe('2:2:2');
  });

  it('includes surah/ayah/wordPosition for reverse mapping', () => {
    const state = buildUnveilState(MOCK_LAYOUT, MOCK_MANIFEST);
    expect(state.words[0]).toMatchObject({ surah: 2, ayah: 1, wordPosition: 1 });
  });

  it('skips words without manifest hitbox (graceful degradation)', () => {
    const layoutWithExtra: MushafLayoutPage = {
      ...MOCK_LAYOUT,
      lines: [
        ...MOCK_LAYOUT.lines,
        {
          line: 4, type: 'text' as const, verseRange: '2:2',
          words: [{ location: '2:2:3', word: 'لَا', qpcV2: 'ﱅ' }],
        },
      ],
    };
    const state = buildUnveilState(layoutWithExtra, MOCK_MANIFEST);
    expect(state.totalWords).toBe(3);
  });
});

describe('revealUpTo', () => {
  it('returns a new state object (immutability)', () => {
    const state = buildUnveilState(MOCK_LAYOUT, MOCK_MANIFEST);
    const revealed = revealUpTo(state, 1);
    expect(revealed).not.toBe(state);
    expect(state.revealedUpTo).toBe(-1);
  });

  it('updates revealedUpTo correctly', () => {
    const state = buildUnveilState(MOCK_LAYOUT, MOCK_MANIFEST);
    const revealed = revealUpTo(state, 2);
    expect(revealed.revealedUpTo).toBe(2);
  });

  it('never goes backwards', () => {
    const state = buildUnveilState(MOCK_LAYOUT, MOCK_MANIFEST);
    const r1 = revealUpTo(state, 2);
    const r2 = revealUpTo(r1, 1);
    expect(r2.revealedUpTo).toBe(2);
  });
});
