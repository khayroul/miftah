import { describe, it, expect } from 'vitest';
import { buildDisplayWords } from './TasmiTextFollow';
import { SequenceMatcher } from '../domain/sequence-matcher';

/**
 * Boundary contract: the display tokenization (TasmiTextFollow.buildDisplayWords)
 * and the matcher tokenization (SequenceMatcher on normalizeArabic'd text) MUST
 * assign the same index space, or the live highlight follows the wrong words.
 *
 * Real producer -> real consumer: no mocks on either side.
 */

const BASMALA = 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ';
const FATIHAH_1_TO_2 = 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ';
// A token that normalizes to empty (pure tatweel) must get NO matcher index.
const WITH_DECORATIVE_TOKEN = 'بِسْمِ ـ اللَّهِ';

describe('TasmiTextFollow ↔ SequenceMatcher index alignment (boundary)', () => {
  it.each([
    ['basmala', BASMALA],
    ['multi-ayah', FATIHAH_1_TO_2],
  ])('display matcher-indexed token count === matcher.totalExpectedWords (%s)', (_name, text) => {
    const display = buildDisplayWords(text);
    const matcher = new SequenceMatcher(text);

    const indexed = display.filter(w => w.matcherIndex !== null);
    expect(indexed.length).toBe(matcher.totalExpectedWords);
    // Indices are dense and ordered 0..n-1 — each display word points at the
    // matcher position the highlight will receive.
    expect(indexed.map(w => w.matcherIndex)).toEqual(
      Array.from({ length: indexed.length }, (_, i) => i),
    );
  });

  it('a token that normalizes to empty gets no matcher index and does not shift alignment', () => {
    const display = buildDisplayWords(WITH_DECORATIVE_TOKEN);
    const matcher = new SequenceMatcher(WITH_DECORATIVE_TOKEN);

    expect(display).toHaveLength(3);
    expect(display[1].matcherIndex).toBeNull();
    const indexed = display.filter(w => w.matcherIndex !== null);
    expect(indexed.length).toBe(matcher.totalExpectedWords);
    expect(indexed.map(w => w.matcherIndex)).toEqual([0, 1]);
  });

  it('the matcher cursor after a real chunk maps onto the display words it highlights', () => {
    const matcher = new SequenceMatcher(BASMALA);
    const display = buildDisplayWords(BASMALA);

    // Recite the first two words (as Whisper would return them, normalized)
    const result = matcher.matchChunk('بسم الله');
    expect(result.lastCorrectIndex).toBe(1);

    // Display words 0..lastCorrectIndex are exactly the two recited words
    const recited = display.filter(
      w => w.matcherIndex !== null && w.matcherIndex <= result.lastCorrectIndex,
    );
    expect(recited.map(w => w.text)).toEqual(['بِسْمِ', 'اللَّهِ']);
    // And the "current" word the UI pulses is the third
    const current = display.find(w => w.matcherIndex === result.lastCorrectIndex + 1);
    expect(current?.text).toBe('الرَّحْمَٰنِ');
  });
});
