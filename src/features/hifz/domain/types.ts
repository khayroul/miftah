// src/types/hifz-exercises.ts
import type { TasmiRatingLabel, TasmiSessionResult } from '@/features/tasmi';
import type { FsrsRating } from '@/shared/types/database';
import type { StudyProgress } from '@/shared/types/database';

export interface AyahDetail {
  id: number;
  surahId: number;
  ayahNumber: number;
  pageNumber: number;
  textUthmani: string;
  displayBm: string | null;
  surahNameEn: string;
  surahNameTranslit: string;
}

export interface PlanItem {
  progress: StudyProgress;
  ayah: AyahDetail;
}

export interface DailyPlanWithDetails {
  sabqi: PlanItem[];
  sabak: PlanItem[];
  manzil: PlanItem[];
}

export interface JuzStat {
  juz: number;
  totalPages: number;
  manzilPages: number;
  sabqiPages: number;
  sabakPages: number;
  notStartedPages: number;
  manzilPagePct: number;
}

export interface HifzStats {
  totalManzilPages: number;
  dueTodayPages: number;
  streak: number;
}

export type PageGridStatus =
  | "not-started"
  | "sabak"
  | "sabqi"
  | "manzil"
  | "due"
  | "overdue";

export interface PageGridEntry {
  page: number;
  juz: number;
  status: PageGridStatus;
  lastReviewedAt: string | null;
}

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
