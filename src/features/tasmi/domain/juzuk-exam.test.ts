import { describe, it, expect } from 'vitest';
import { buildExamRound } from './juzuk-exam';

const AYAHS = [
  { id: 10, surahId: 2, ayahNumber: 8, textSimple: 'ومن الناس من يقول' },
  { id: 11, surahId: 2, ayahNumber: 9, textSimple: 'يخادعون الله والذين امنوا' },
  { id: 12, surahId: 2, ayahNumber: 10, textSimple: 'في قلوبهم مرض' },
];

describe('buildExamRound', () => {
  it('returns null for an empty span', () => {
    expect(buildExamRound([])).toBeNull();
  });

  it('concatenates the span and derives the round contract', () => {
    const round = buildExamRound(AYAHS);
    expect(round).not.toBeNull();
    expect(round!.surahNumber).toBe(2);
    expect(round!.startAyah).toBe(8);
    expect(round!.endAyah).toBe(10);
    expect(round!.expectedText).toBe(
      'ومن الناس من يقول يخادعون الله والذين امنوا في قلوبهم مرض',
    );
  });

  it('assigns contiguous word ranges matching each ayah word count', () => {
    const round = buildExamRound(AYAHS)!;
    expect(round.ayahRanges).toEqual([
      { surah: 2, ayah: 8, startWordIndex: 0, endWordIndex: 3 },
      { surah: 2, ayah: 9, startWordIndex: 4, endWordIndex: 7 },
      { surah: 2, ayah: 10, startWordIndex: 8, endWordIndex: 10 },
    ]);
    // Ranges tile the full token space of expectedText with no gaps/overlap
    const totalWords = round.expectedText.split(/\s+/).filter(Boolean).length;
    expect(round.ayahRanges[round.ayahRanges.length - 1].endWordIndex).toBe(totalWords - 1);
  });

  it('handles a single-ayah span (test ayah is the last on its page)', () => {
    const round = buildExamRound([AYAHS[2]])!;
    expect(round.startAyah).toBe(10);
    expect(round.endAyah).toBe(10);
    expect(round.ayahRanges).toHaveLength(1);
    expect(round.ayahRanges[0]).toEqual({
      surah: 2, ayah: 10, startWordIndex: 0, endWordIndex: 2,
    });
  });
});
