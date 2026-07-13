export type ActivityType = "read" | "faham" | "hifz" | "theme";

export type DailyGoalType =
  | "faham_words"
  | "read_pages"
  | "hifz_ayat"
  | "hifz_pages"
  | "theme_chunks";

export type ActivityEventType =
  | "faham_word_reviewed"
  | "hifz_ayah_memorized"
  | "hifz_ayah_reviewed"
  | "read_page_viewed"
  | "theme_chunk_completed"
  | "theme_chunk_started";

export type ActivityEntityType = "ayah" | "page" | "theme_chunk" | "word";

export interface RecordActivityEventInput {
  activityType: ActivityEventType;
  entityId?: number | null;
  entityKey: string;
  entityType: ActivityEntityType;
  metadata?: Record<string, unknown>;
  occurredAt?: string;
  userId: string;
}

export interface DailyActivityEventSummary {
  activityDate: string;
  fahamWordsCount: number;
  hifzAyatCount: number;
  readPagesCount: number;
  themeChunksCount: number;
  totalEvents: number;
}

export interface ActivityStreak {
  current_streak: number;
  longest_streak: number;
  last_activity_date: string | null;
}
