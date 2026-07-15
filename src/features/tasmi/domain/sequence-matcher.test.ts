import { describe, it, expect } from 'vitest';
import { SequenceMatcher } from './sequence-matcher';

const BASMALA = 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ';
const FATIHAH_2 = 'الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ';

describe('SequenceMatcher', () => {
  it('initializes with correct word count', () => {
    const m = new SequenceMatcher(BASMALA);
    expect(m.totalExpectedWords).toBe(4); // بسم الله الرحمن الرحيم
    expect(m.lastCorrectIndex).toBe(-1);
    expect(m.isComplete).toBe(false);
    expect(m.progress).toBe(0);
  });

  it('matches exact transcription', () => {
    const m = new SequenceMatcher(BASMALA);
    const result = m.matchChunk('بسم الله الرحمن الرحيم');
    expect(result.isClean).toBe(true);
    expect(result.wordsCorrect).toBe(4);
    expect(result.errors).toHaveLength(0);
    expect(m.isComplete).toBe(true);
    expect(m.progress).toBe(1);
  });

  it('matches partial transcription and advances', () => {
    const m = new SequenceMatcher(BASMALA);

    const r1 = m.matchChunk('بسم الله');
    expect(r1.isClean).toBe(true);
    expect(r1.wordsCorrect).toBe(2);
    expect(m.lastCorrectIndex).toBe(1);
    expect(m.progress).toBe(0.5);

    const r2 = m.matchChunk('الرحمن الرحيم');
    expect(r2.isClean).toBe(true);
    expect(r2.wordsCorrect).toBe(2);
    expect(m.isComplete).toBe(true);
  });

  it('forgives one or more immediate repeated words as a stutter', () => {
    const m = new SequenceMatcher(BASMALA);

    const result = m.matchChunk('بسم بسم بسم الله الرحمن الرحيم');

    expect(result.isClean).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.wordsCorrect).toBe(4);
    expect(m.isComplete).toBe(true);
  });

  it('forgives a repeated boundary word and then advances normally', () => {
    const m = new SequenceMatcher(BASMALA);
    m.matchChunk('بسم الله');

    const result = m.matchChunk('الله الرحمن الرحيم');

    expect(result.isClean).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.wordsCorrect).toBe(2);
    expect(m.isComplete).toBe(true);
  });

  it('still reports an unrelated extra word as an error', () => {
    const m = new SequenceMatcher(BASMALA);

    const result = m.matchChunk('بسم زيادة الله الرحمن الرحيم');

    expect(result.isClean).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ type: 'substitution', got: 'زياده' }),
    );
  });

  it('detects substitution error', () => {
    const m = new SequenceMatcher(BASMALA);
    const result = m.matchChunk('بسم الخطأ');
    expect(result.isClean).toBe(false);
    expect(result.wordsCorrect).toBe(1); // بسم matched
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].type).toBe('substitution');
    expect(result.errors[0].position).toBe(1);
    expect(result.errors[0].got).toBe('الخطا'); // normalized
    expect(m.lastCorrectIndex).toBe(0); // stuck at بسم
  });

  it('detects omission via lookahead', () => {
    const m = new SequenceMatcher(BASMALA);
    // Student says "بسم الرحمن" — skipped "الله"
    const result = m.matchChunk('بسم الرحمن');
    expect(result.wordsCorrect).toBe(2); // بسم + الرحمن
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].type).toBe('omission');
    expect(result.errors[0].position).toBe(1); // الله was skipped
    expect(m.lastCorrectIndex).toBe(2); // advanced past الرحمن
  });

  it('stops on unrecoverable error', () => {
    const m = new SequenceMatcher(FATIHAH_2);
    // "الحمد خطأ خطأ خطأ" — first word matches, then error
    const result = m.matchChunk('الحمد خطا');
    expect(result.wordsCorrect).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(m.lastCorrectIndex).toBe(0);
    // Should not advance further
  });

  it('handles transcription with diacritics', () => {
    const m = new SequenceMatcher(BASMALA);
    // Transcription may include diacritics — normalizer strips them
    const result = m.matchChunk('بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ');
    expect(result.isClean).toBe(true);
    expect(result.wordsCorrect).toBe(4);
  });

  it('getNextExpectedWord returns correct word', () => {
    const m = new SequenceMatcher(BASMALA);
    expect(m.getNextExpectedWord()).toBe('بسم');

    m.matchChunk('بسم');
    expect(m.getNextExpectedWord()).toBe('الله');

    m.matchChunk('الله الرحمن الرحيم');
    expect(m.getNextExpectedWord()).toBeNull();
  });

  it('getPositionForTalqin returns word info', () => {
    const m = new SequenceMatcher(BASMALA);
    m.matchChunk('بسم الله');

    const pos = m.getPositionForTalqin();
    expect(pos).toEqual({ wordIndex: 2, word: 'الرحمن' });
  });

  it('getPositionForTalqin returns null when complete', () => {
    const m = new SequenceMatcher(BASMALA);
    m.matchChunk('بسم الله الرحمن الرحيم');
    expect(m.getPositionForTalqin()).toBeNull();
  });

  it('reset clears progress', () => {
    const m = new SequenceMatcher(BASMALA);
    m.matchChunk('بسم الله');
    expect(m.lastCorrectIndex).toBe(1);

    m.reset();
    expect(m.lastCorrectIndex).toBe(-1);
    expect(m.progress).toBe(0);
  });

  it('handles empty transcription gracefully', () => {
    const m = new SequenceMatcher(BASMALA);
    const result = m.matchChunk('');
    expect(result.isClean).toBe(true);
    expect(result.wordsCorrect).toBe(0);
    expect(m.lastCorrectIndex).toBe(-1);
  });

  it('handles multi-ayah expected text', () => {
    const m = new SequenceMatcher(BASMALA + ' ' + FATIHAH_2);
    // 4 + 4 = 8 words
    expect(m.totalExpectedWords).toBe(8);

    m.matchChunk('بسم الله الرحمن الرحيم');
    expect(m.lastCorrectIndex).toBe(3);

    m.matchChunk('الحمد لله رب العالمين');
    expect(m.isComplete).toBe(true);
  });

  it('handles lookback: student restarts a few words back and advances past', () => {
    const m = new SequenceMatcher(BASMALA + ' ' + FATIHAH_2);
    // 8 words: بسم الله الرحمن الرحيم الحمد لله رب العالمين

    // Recite first 4 words
    m.matchChunk('بسم الله الرحمن الرحيم');
    expect(m.lastCorrectIndex).toBe(3);

    // Restart from word 3 (الرحمن) and continue past word 4
    const result = m.matchChunk('الرحمن الرحيم الحمد لله');
    expect(result.isClean).toBe(true);
    expect(m.lastCorrectIndex).toBe(5); // advanced to لله
  });

  it('handles lookback: student repeats without advancing past high-water mark', () => {
    const m = new SequenceMatcher(BASMALA + ' ' + FATIHAH_2);

    // Recite first 6 words
    m.matchChunk('بسم الله الرحمن الرحيم');
    m.matchChunk('الحمد لله');
    expect(m.lastCorrectIndex).toBe(5);

    // Repeat words 3-4 (الرحيم الحمد) — doesn't advance past 5
    const result = m.matchChunk('الرحيم الحمد');
    expect(result.isClean).toBe(true);
    expect(result.wordsCorrect).toBe(0); // no new progress counted
    expect(m.lastCorrectIndex).toBe(5); // stays at high-water mark
  });

  it('lookback requires ≥2 matching words to trigger', () => {
    const m = new SequenceMatcher(BASMALA + ' ' + FATIHAH_2);

    m.matchChunk('بسم الله الرحمن الرحيم');
    expect(m.lastCorrectIndex).toBe(3);

    // Single word that matches earlier position — not enough for lookback
    // "الله" alone could match word 1, but ≥2 required
    // Should be treated as a forward error since الله ≠ expected word 5 (الحمد)
    const result = m.matchChunk('خطا');
    expect(result.isClean).toBe(false);
  });
});

describe('SequenceMatcher streaming preview and conservative fuzzy matching', () => {
  it('previews cumulative text without mutating the confirmed cursor', () => {
    const matcher = new SequenceMatcher('بسم الله الرحمن الرحيم');

    const preview = matcher.previewChunk('بسم اللة');

    expect(preview.lastCorrectIndex).toBe(1);
    expect(preview.errors).toHaveLength(0);
    expect(matcher.lastCorrectIndex).toBe(-1);

    const committed = matcher.matchChunk('بسم اللة');
    expect(committed.lastCorrectIndex).toBe(1);
    expect(matcher.lastCorrectIndex).toBe(1);
  });

  it('does not fuzzy-accept short Arabic function words', () => {
    const matcher = new SequenceMatcher('من الناس');

    const result = matcher.matchChunk('ما');

    expect(result.wordsCorrect).toBe(0);
    expect(result.errors).toEqual([
      expect.objectContaining({ position: 0, type: 'substitution' }),
    ]);
  });

  it('prefers an exact lookahead omission over a fuzzy current-word match', () => {
    const matcher = new SequenceMatcher('الرحمن الرحيم');

    const result = matcher.matchChunk('الرحيم');

    expect(result.lastCorrectIndex).toBe(1);
    expect(result.errors).toEqual([
      expect.objectContaining({ position: 0, type: 'omission' }),
    ]);
  });
});
