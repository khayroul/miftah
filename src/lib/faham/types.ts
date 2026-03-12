import type {
  FahamSourceType,
  VocabExposureSummary,
  VocabProgress,
  Word,
} from "@/types/database";

interface WordOccurrenceLite {
  ayah_id: number;
  position: number;
  ayats: { surah_id: number; ayah_number: number } | { surah_id: number; ayah_number: number }[] | null;
}

export type WordWithOccurrences = Word & {
  word_occurrences?: WordOccurrenceLite | WordOccurrenceLite[] | null;
};

export interface FahamDueCard {
  progress: VocabProgress;
  word: WordWithOccurrences;
}

export interface FahamCandidateWord {
  summary: VocabExposureSummary;
  word: WordWithOccurrences;
}

export interface FahamEngineConfig {
  candidatePoolSize: number;
  dueLimit: number;
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
