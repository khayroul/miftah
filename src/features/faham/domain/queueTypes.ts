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
  href: string;
  type: import("@/shared/types/database").FahamSourceType;
  // Structured data for render-time i18n resolution (the same pattern as
  // FahamStudyCard.tsx's resolveMcqLabels): builders populate only ids/
  // numbers here, and the render site (FahamStudyCard's
  // resolveSourceLinkDisplay) composes the localized label/detail text.
  // `origin` disambiguates the two builders' distinct phrasing —
  // "offline" (offlineQueue.ts, tier-package fallback, no ayah
  // cross-reference available) vs "online" (queueBuilder.ts, may cite the
  // exact ayah via ayahReferenceLabel).
  origin: "offline" | "online";
  pageNumber?: number | null;
  surahId?: number | null;
  themeChunkIndex?: number | null;
  ayahReferenceLabel?: string | null;
  /**
   * @deprecated Pre-rendered Malay display strings, kept only so queue
   * snapshots cached (localStorage/IndexedDB) before this structured-field
   * migration still render something on restore. New builders no longer
   * populate these; resolveSourceLinkDisplay() falls back to them only when
   * the structured fields above are absent.
   */
  detail?: string;
  /** @deprecated see `detail` */
  label?: string;
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
