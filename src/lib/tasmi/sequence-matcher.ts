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
   * Match a transcribed chunk against the expected sequence,
   * starting from the current position.
   */
  matchChunk(transcribedText: string): MatchResult {
    const transcribedWords = tokenizeWords(normalizeArabic(transcribedText));
    const errors: MatchResult['errors'] = [];
    let wordsCorrect = 0;

    const startIndex = this._lastCorrectIndex + 1;

    for (let i = 0; i < transcribedWords.length; i++) {
      const expectedIndex = startIndex + i;

      // Past the end of expected text
      if (expectedIndex >= this.expectedWords.length) {
        break;
      }

      const expected = this.expectedWords[expectedIndex];
      const got = transcribedWords[i];

      if (expected === got) {
        this._lastCorrectIndex = expectedIndex;
        wordsCorrect++;
      } else {
        // Check if the word matches a nearby expected word (skip detection)
        // Look ahead up to 2 positions for a match
        let foundAhead = false;
        for (let lookAhead = 1; lookAhead <= 2; lookAhead++) {
          if (expectedIndex + lookAhead < this.expectedWords.length &&
              this.expectedWords[expectedIndex + lookAhead] === got) {
            // Student skipped word(s)
            for (let skipped = 0; skipped < lookAhead; skipped++) {
              errors.push({
                position: expectedIndex + skipped,
                expected: this.expectedWords[expectedIndex + skipped],
                got: null,
                type: 'omission',
              });
            }
            this._lastCorrectIndex = expectedIndex + lookAhead;
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
          // Don't advance lastCorrectIndex on error
          break;  // Stop matching on first unrecoverable error
        }
      }
    }

    return {
      lastCorrectIndex: this._lastCorrectIndex,
      wordsCorrect,
      wordsTotal: transcribedWords.length,
      errors,
      isClean: errors.length === 0,
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
