import type {
  FahamSourceType,
  VocabExposureSummary,
  VocabProgress,
  Word,
} from "@/types/database";

export interface FahamDueCard {
  progress: VocabProgress;
  word: Word & { word_occurrences?: any };
}

export interface FahamCandidateWord {
  summary: VocabExposureSummary;
  word: Word & { word_occurrences?: any };
}

export interface FahamEngineConfig {
  candidatePoolSize: number;
  sessionSize: number;
  minDistinctContextCount: number;
  minExposureEventCount: number;
  minOccurrenceWeight: number;
  newWeight: number;
  dueWeight: number;
  masteredWeight: number;
  pauseNewCardsAboveDueCount: number;
  preferredSources: FahamSourceType[];
}

export interface FahamQueuePlan {
  blockedReason: "due_backlog" | null;
  dueCards: FahamDueCard[];
  newCandidates: FahamCandidateWord[];
  masteredCards: FahamDueCard[];
  stats: {
    dueCount: number;
    eligibleNewCount: number;
    totalCandidateCount: number;
    masteredCount: number;
  };
}

export type FahamExposureInput =
  | {
      ayahIds: number[];
      pageNumber: number;
      sourceType: "reading_page";
      surahId?: number | null;
    }
  | {
      ayahIds: number[];
      sourceType: "theme_chunk";
      surahId: number;
      themeChunkIndex: number;
    }
  | {
      ayahIds: number[];
      sourceType: "hifz_ayah";
      surahId?: number | null;
    };
