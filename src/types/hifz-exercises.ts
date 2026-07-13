// src/types/hifz-exercises.ts
import type { TasmiRatingLabel, TasmiSessionResult } from '@/features/tasmi';
import type { FsrsRating } from '@/types/database';

/** Supported hifz exercise flows (separate from HifzFlowType which covers memorize/review) */
export type HifzExerciseFlow = 'tebuk' | 'unveil';

/** A single word from a mushaf page in reading order */
export interface PageWord {
  location: string;       // "2:255:3" (surah:ayah:wordPos)
  surah: number;
  ayah: number;
  wordPosition: number;
  text: string;           // Uthmani text
  qpcV2: string;          // QCF glyph codepoint
}

/** Tebuk prompt: 4 words + continuation info */
export interface TebukPrompt {
  surah: number;
  ayah: number;
  startWordIdx: number;
  promptWords: PageWord[];
  continuationText: string;
  continuationAyahKeys: string[];
}

/** Result of a single tebuk round */
export interface TebukRoundResult {
  prompt: TebukPrompt;
  tasmiResult: TasmiSessionResult;
  rating: FsrsRating;
  label: TasmiRatingLabel;
}

/** Common session result shape for hifz exercises */
export interface HifzExerciseResult {
  flow: HifzExerciseFlow;
  pageNumber: number;
  rounds: TebukRoundResult[] | null;
  unveilResult: TasmiSessionResult | null;
  aggregateRating: FsrsRating;
  ayahRatings: Array<{
    ayahKey: string;
    ayah: number;
    rating: FsrsRating;
    label: TasmiRatingLabel;
  }>;
  durationSeconds: number;
}

/** Ayah word range for per-ayah FSRS scoring */
export interface AyahWordRange {
  surah: number;
  ayah: number;
  ayahKey: string;
  startWordIndex: number;
  endWordIndex: number;
}
