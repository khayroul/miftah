/**
 * Sequence matcher for tasmi' engine.
 * Compares transcribed words against expected Quran text.
 * Tracks recitation progress and identifies errors.
 */

import { normalizeArabic, tokenizeWords } from './arabic-normalizer';

export interface MatchResult {
  /** Index of the last correctly matched word in the expected sequence */
  lastCorrectIndex: number;
  /** Total words matched correctly in this chunk */
  wordsCorrect: number;
  /** Total words in this chunk */
  wordsTotal: number;
  /** Specific errors found */
  errors: Array<{
    position: number;        // Index in expected sequence
    expected: string;        // Expected word
    got: string | null;      // What was said (null = omitted)
    type: 'substitution' | 'insertion' | 'omission';
  }>;
  /** Whether the chunk was a complete match */
  isClean: boolean;
}

export class SequenceMatcher {
  private expectedWords: string[];
  private _lastCorrectIndex: number = -1;

  constructor(expectedText: string) {
    this.expectedWords = tokenizeWords(normalizeArabic(expectedText));
  }

  get lastCorrectIndex(): number {
    return this._lastCorrectIndex;
  }

  get totalExpectedWords(): number {
    return this.expectedWords.length;
  }

  get isComplete(): boolean {
    return this._lastCorrectIndex >= this.expectedWords.length - 1;
  }

  get progress(): number {
    if (this.expectedWords.length === 0) return 1;
    return (this._lastCorrectIndex + 1) / this.expectedWords.length;
  }

  /**
   * Try matching transcribed words starting from a given position.
   * Returns match stats without mutating state.
   */
  private tryMatchFrom(
    transcribedWords: string[],
    fromIndex: number,
  ): { wordsCorrect: number; lastIndex: number; errors: MatchResult['errors'] } {
    const errors: MatchResult['errors'] = [];
    let wordsCorrect = 0;
    let lastIndex = fromIndex - 1;

    for (let i = 0; i < transcribedWords.length; i++) {
      const expectedIndex = fromIndex + i;
      if (expectedIndex >= this.expectedWords.length) break;

      const expected = this.expectedWords[expectedIndex];
      const got = transcribedWords[i];

      if (expected === got) {
        lastIndex = expectedIndex;
        wordsCorrect++;
      } else {
        // Look ahead up to 2 positions for a skip
        let foundAhead = false;
        for (let lookAhead = 1; lookAhead <= 2; lookAhead++) {
          if (expectedIndex + lookAhead < this.expectedWords.length &&
              this.expectedWords[expectedIndex + lookAhead] === got) {
            for (let skipped = 0; skipped < lookAhead; skipped++) {
              errors.push({
                position: expectedIndex + skipped,
                expected: this.expectedWords[expectedIndex + skipped],
                got: null,
                type: 'omission',
              });
            }
            lastIndex = expectedIndex + lookAhead;
            wordsCorrect++;
            foundAhead = true;
            break;
          }
        }

        if (!foundAhead) {
          errors.push({
            position: expectedIndex,
            expected,
            got,
            type: 'substitution',
          });
          break;
        }
      }
    }

    return { wordsCorrect, lastIndex, errors };
  }

  /**
   * Match a transcribed chunk against the expected sequence.
   * First tries forward from current position.
   * If that fails, checks if the student restarted a few words back
   * (common pattern: restart from earlier position to regain flow).
   */
  matchChunk(transcribedText: string): MatchResult {
    const transcribedWords = tokenizeWords(normalizeArabic(transcribedText));
    if (transcribedWords.length === 0) {
      return {
        lastCorrectIndex: this._lastCorrectIndex,
        wordsCorrect: 0,
        wordsTotal: 0,
        errors: [],
        isClean: true,
      };
    }

    const forwardStart = this._lastCorrectIndex + 1;
    const forward = this.tryMatchFrom(transcribedWords, forwardStart);

    // Forward match worked — use it
    if (forward.wordsCorrect > 0 && forward.errors.length === 0) {
      this._lastCorrectIndex = forward.lastIndex;
      return {
        lastCorrectIndex: this._lastCorrectIndex,
        wordsCorrect: forward.wordsCorrect,
        wordsTotal: transcribedWords.length,
        errors: forward.errors,
        isClean: true,
      };
    }

    // Forward didn't match cleanly — check lookback (student restarting earlier)
    // Search up to 10 words back, need ≥2 consecutive correct words to confirm
    const lookbackLimit = Math.min(this._lastCorrectIndex + 1, 10);
    let bestLookback: { wordsCorrect: number; lastIndex: number; errors: MatchResult['errors'] } | null = null;

    for (let back = 1; back <= lookbackLimit; back++) {
      const tryStart = forwardStart - back;
      if (tryStart < 0) break;
      const attempt = this.tryMatchFrom(transcribedWords, tryStart);

      // Require ≥2 correct words and clean match to confirm it's a genuine restart
      if (attempt.wordsCorrect >= 2 && attempt.errors.length === 0) {
        if (!bestLookback || attempt.wordsCorrect > bestLookback.wordsCorrect) {
          bestLookback = attempt;
        }
      }
    }

    if (bestLookback && bestLookback.lastIndex > this._lastCorrectIndex) {
      // Student restarted earlier and advanced past previous position — accept it
      this._lastCorrectIndex = bestLookback.lastIndex;
      return {
        lastCorrectIndex: this._lastCorrectIndex,
        wordsCorrect: bestLookback.wordsCorrect,
        wordsTotal: transcribedWords.length,
        errors: bestLookback.errors,
        isClean: true,
      };
    }

    if (bestLookback) {
      // Restarted earlier but didn't advance past previous high-water mark
      // Treat as clean (student is repeating for flow), don't penalize
      return {
        lastCorrectIndex: this._lastCorrectIndex,
        wordsCorrect: 0,
        wordsTotal: transcribedWords.length,
        errors: [],
        isClean: true,
      };
    }

    // No lookback match either — genuine error
    this._lastCorrectIndex = forward.lastIndex;
    return {
      lastCorrectIndex: this._lastCorrectIndex,
      wordsCorrect: forward.wordsCorrect,
      wordsTotal: transcribedWords.length,
      errors: forward.errors,
      isClean: forward.errors.length === 0,
    };
  }

  /**
   * Get the next expected word (for talqin prompt).
   */
  getNextExpectedWord(): string | null {
    const nextIndex = this._lastCorrectIndex + 1;
    return nextIndex < this.expectedWords.length
      ? this.expectedWords[nextIndex]
      : null;
  }

  /**
   * Get the ayah/word reference for the current position.
   * Used to seek Quran Foundation audio for talqin.
   */
  getPositionForTalqin(): { wordIndex: number; word: string } | null {
    const nextIndex = this._lastCorrectIndex + 1;
    if (nextIndex >= this.expectedWords.length) return null;

    return {
      wordIndex: nextIndex,
      word: this.expectedWords[nextIndex],
    };
  }

  /**
   * Reset matcher to beginning.
   */
  reset(): void {
    this._lastCorrectIndex = -1;
  }
}
