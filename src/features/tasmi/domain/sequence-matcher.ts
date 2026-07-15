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

function allowedWordDistance(expected: string, got: string): number {
  const shortest = Math.min(expected.length, got.length);
  const longest = Math.max(expected.length, got.length);
  if (shortest < 4) return 0;
  return longest >= 7 ? 2 : 1;
}

function boundedEditDistance(left: string, right: string, limit: number): number {
  if (Math.abs(left.length - right.length) > limit) return limit + 1;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex++) {
    const current = [leftIndex];
    let rowMinimum = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex++) {
      const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      const value = Math.min(
        previous[rightIndex] + 1,
        current[rightIndex - 1] + 1,
        previous[rightIndex - 1] + substitutionCost,
      );
      current.push(value);
      rowMinimum = Math.min(rowMinimum, value);
    }
    if (rowMinimum > limit) return limit + 1;
    previous = current;
  }

  return previous[right.length];
}

function wordsEquivalent(expected: string, got: string): boolean {
  if (expected === got) return true;
  const limit = allowedWordDistance(expected, got);
  return limit > 0 && boundedEditDistance(expected, got, limit) <= limit;
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
    let expectedPos = fromIndex;
    // The cursor may only pass an error position when a LATER correct word
    // anchors it (same rule the omission lookahead already follows). Track the
    // last position that a correct recitation actually landed on.
    let lastAnchored = fromIndex - 1;

    for (let i = 0; i < transcribedWords.length; i++) {
      if (expectedPos >= this.expectedWords.length) break;

      const expected = this.expectedWords[expectedPos];
      const got = transcribedWords[i];

      if (expected === got) {
        wordsCorrect++;
        lastAnchored = expectedPos;
        expectedPos++;
      } else if (
        expectedPos > 0 &&
        this.expectedWords[expectedPos - 1] === got
      ) {
        // Conservative stutter grace: an immediate exact repeat of the word
        // just accepted is neither new progress nor a mistake. Keep waiting
        // for the same expected word. Unrelated insertions still fail below.
        continue;
      } else {
        // Look ahead up to 2 positions for a skip (student omitted words)
        let foundAhead = false;
        for (let la = 1; la <= 2; la++) {
          if (expectedPos + la < this.expectedWords.length &&
              this.expectedWords[expectedPos + la] === got) {
            for (let s = 0; s < la; s++) {
              errors.push({
                position: expectedPos + s,
                expected: this.expectedWords[expectedPos + s],
                got: null,
                type: 'omission',
              });
            }
            wordsCorrect++;
            lastAnchored = expectedPos + la;
            expectedPos += la + 1;
            foundAhead = true;
            break;
          }
        }

        if (!foundAhead && wordsEquivalent(expected, got)) {
          // Quran text is fixed, while ASR often varies by one character. Only
          // accept a conservative fuzzy match AFTER exact lookahead has had a
          // chance to identify a genuinely skipped word.
          wordsCorrect++;
          lastAnchored = expectedPos;
          expectedPos++;
          foundAhead = true;
        }

        if (!foundAhead) {
          // T-01: record the substitution and KEEP matching the rest of the
          // chunk instead of discarding it — a mid-chunk slip no longer
          // throws away every correct word recited after it. The cursor
          // (lastIndex) only advances past this position if a later correct
          // word anchors it; a trailing unanchored substitution holds the
          // cursor so talqin corrects the word that was actually wrong.
          errors.push({
            position: expectedPos,
            expected,
            got,
            type: 'substitution',
          });
          expectedPos++;
        }
      }
    }

    return { wordsCorrect, lastIndex: lastAnchored, errors };
  }

  /**
   * Match a transcribed chunk against the expected sequence.
   * First tries forward from current position.
   * If that fails, checks if the student restarted a few words back
   * (common pattern: restart from earlier position to regain flow).
   */
  private evaluateChunk(transcribedText: string, commit: boolean): MatchResult {
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
      if (commit) this._lastCorrectIndex = forward.lastIndex;
      return {
        lastCorrectIndex: forward.lastIndex,
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
      if (commit) this._lastCorrectIndex = bestLookback.lastIndex;
      return {
        lastCorrectIndex: bestLookback.lastIndex,
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

    // No lookback match either — genuine error.
    // Anchor guard: only advance position when the chunk contained at least one
    // CORRECT word. Without it, a pure-noise chunk (all substitutions) would
    // drag the position forward through words the reciter never said.
    const resolvedLastCorrectIndex = forward.wordsCorrect > 0
      ? forward.lastIndex
      : this._lastCorrectIndex;
    if (commit && forward.wordsCorrect > 0) this._lastCorrectIndex = forward.lastIndex;
    return {
      lastCorrectIndex: resolvedLastCorrectIndex,
      wordsCorrect: forward.wordsCorrect,
      wordsTotal: transcribedWords.length,
      errors: forward.errors,
      isClean: forward.errors.length === 0,
    };
  }

  matchChunk(transcribedText: string): MatchResult {
    return this.evaluateChunk(transcribedText, true);
  }

  /**
   * Evaluate a cumulative streaming hypothesis without advancing or scoring the
   * real session cursor. Tentative ASR revisions are therefore safe to redraw.
   */
  previewChunk(transcribedText: string): MatchResult {
    return this.evaluateChunk(transcribedText, false);
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
