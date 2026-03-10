import type {
  FahamSourceType,
  VocabExposureSummary,
  VocabProgress,
  Word,
} from "@/types/database";

export interface FahamDueCard {
  progress: VocabProgress;
  word: Word;
}

export interface FahamCandidateWord {
  summary: VocabExposureSummary;
  word: Word;
}

export interface FahamEngineConfig {
  candidatePoolSize: number;
  dueLimit: number;
  minDistinctContextCount: number;
  minExposureEventCount: number;
  minOccurrenceWeight: number;
  newLimit: number;
  pauseNewCardsAboveDueCount: number;
  preferredSources: FahamSourceType[];
}

export interface FahamQueuePlan {
  blockedReason: "due_backlog" | null;
  dueCards: FahamDueCard[];
  newCandidates: FahamCandidateWord[];
  stats: {
    dueCount: number;
    eligibleNewCount: number;
    totalCandidateCount: number;
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
