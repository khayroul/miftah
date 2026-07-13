import type { FahamBuiltMcq } from "./mcq";
import type { FahamLevelProgress } from "./levels";

export interface SerializedFahamCard {
  due: string;
  exposure?: {
    distinctContextCount: number;
    exposureEventCount: number;
    hifzOccurrenceWeight: number;
    readingOccurrenceWeight: number;
    themeOccurrenceWeight: number;
  };
  fsrs: {
    difficulty: number;
    elapsedDays: number;
    lapses: number;
    lastReview: string | null;
    scheduledDays: number;
    stability: number;
  };
  kind: "due" | "new" | "mastered";
  mcq: FahamBuiltMcq;
  mistakeStreak: number;
  needsReinforcement: boolean;
  progressId: number;
  reps: number;
  sourceContext?: SerializedFahamSourceContext;
  state: number;
  word: {
    frequency: number;
    id: number;
    textSimple: string;
    textUthmani: string;
    translationBm: string | null;
    translationEn: string | null;
    transliteration: string | null;
  };
}

export interface SerializedFahamPrimaryReference {
  ayahNumber: number;
  href: string | null;
  label: string;
  pageNumber: number | null;
  position: number;
  surahId: number;
}

export interface SerializedFahamSourceLink {
  detail: string;
  href: string;
  label: string;
  type: import("@/types/database").FahamSourceType;
}

export interface SerializedFahamSourceContext {
  primaryReference: SerializedFahamPrimaryReference | null;
  sources: SerializedFahamSourceLink[];
}

export interface FahamQueueSnapshot {
  blockedReason: "due_backlog" | null;
  due: SerializedFahamCard[];
  levelProgress: FahamLevelProgress;
  new: SerializedFahamCard[];
  mastered: SerializedFahamCard[];
  learning: SerializedFahamCard[];
  stats: {
    dueCount: number;
    eligibleNewCount: number;
    focusWordLimit: number;
    totalCandidateCount: number;
    masteredCount: number;
    learningCount: number;
  };
}
