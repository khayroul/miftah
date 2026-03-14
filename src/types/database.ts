// Miftah database types — mirrors Supabase schema

// ============================================================
// Layer 1: Quranic Text
// ============================================================

export interface Surah {
  id: number;
  name_arabic: string;
  name_transliteration: string;
  name_bm: string;
  name_en: string;
  revelation_type: "meccan" | "medinan";
  ayah_count: number;
  juz_start: number;
  page_start: number;
  page_end: number;
  order_revealed: number | null;
}

export interface Ayah {
  id: number;
  surah_id: number;
  ayah_number: number;
  text_uthmani: string;
  text_simple: string;
  translation_id: string | null;
  translation_en: string | null;
  display_bm: string | null;
  bm_flagged: boolean;
  bm_resolution_notes: string | null;
  bm_correction_note: string | null;
  page_number: number;
  juz_number: number;
  hizb_number: number | null;
  ruku_number: number | null;
  sajdah: boolean;
  word_count: number;
  audio_url: string | null;
}

export interface Word {
  id: number;
  text_uthmani: string;
  text_simple: string;
  translation_bm: string | null;
  translation_en: string | null;
  transliteration: string | null;
  root: string | null;
  lemma: string | null;
  pos: string | null;
  frequency: number;
}

export interface WordOccurrence {
  id: number;
  word_id: number;
  ayah_id: number;
  position: number;
  page_number: number;
}

// ============================================================
// Layer 2: Thematic
// ============================================================

export type ThemeCategory =
  | "aqidah"
  | "ibadah"
  | "akhlak"
  | "muamalat"
  | "qasas"
  | "kawniyyat";

export interface Theme {
  id: number;
  name_bm: string;
  name_en: string;
  category: ThemeCategory;
  description_bm: string | null;
  description_en: string | null;
  parent_id: number | null;
}

export interface ThemeAyah {
  id: number;
  theme_id: number;
  ayah_id: number;
  relevance: "primary" | "secondary" | null;
  notes: string | null;
}

export type ThemeChunkProgressStatus = "started" | "completed";

export interface AyahThemeChunk {
  id: number;
  source_chunk_id: number | null;
  surah_id: number;
  ayah_from: number;
  ayah_to: number;
  ayah_id_from: number | null;
  ayah_id_to: number | null;
  verse_key_from: string | null;
  verse_key_to: string | null;
  verses_count: number;
  theme: string;
  theme_bm: string | null;
  keywords: string[] | null;
  book_id: number | null;
}

export interface AsbabNuzul {
  id: number;
  ayah_id: number;
  text_bm: string;
  text_en: string | null;
  source: string | null;
}

// ============================================================
// Layer 3: Hadith
// ============================================================

export interface HadithSource {
  id: number;
  name: string;
  name_arabic: string | null;
  compiler: string | null;
  hadith_count: number;
}

export interface HadithKitab {
  id: number;
  source_id: number;
  name_bm: string;
  name_en: string | null;
  name_arabic: string | null;
  kitab_number: number | null;
}

export interface Hadith {
  id: number;
  source_id: number;
  kitab_id: number | null;
  hadith_number: number | null;
  text_arabic: string | null;
  text_bm: string | null;
  text_en: string | null;
  narrator: string | null;
  grade: string | null;
}

export interface HadithAyahLink {
  id: number;
  hadith_id: number;
  ayah_id: number;
  link_type: "tafsir" | "hukm" | "context" | "general" | null;
  notes: string | null;
}

// ============================================================
// Layer 4: Progress (FSRS)
// ============================================================

export type FsrsState = 0 | 1 | 2 | 3; // New, Learning, Review, Relearning
export type FsrsRating = 1 | 2 | 3 | 4; // Again, Hard, Good, Easy
export type HifzStatus = "not_started" | "sabak" | "sabqi" | "manzil";

export interface FsrsFields {
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  reps: number;
  lapses: number;
  state: FsrsState;
  due: string; // ISO 8601
  last_review: string | null;
}

export interface StudyProgress extends FsrsFields {
  id: number;
  user_id: string;
  ayah_id: number;
  hifz_status: HifzStatus;
  sabak_started_at: string | null;
  moved_to_sabqi_at: string | null;
  moved_to_manzil_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface VocabProgress extends FsrsFields {
  id: number;
  user_id: string;
  word_id: number;
  needs_reinforcement: boolean;
  mistake_streak: number;
  last_incorrect_at: string | null;
  is_mastered: boolean;
  correct_streak: number;
  incorrect_streak: number;
  created_at: string;
  updated_at: string;
}

export type FahamSourceType = "reading_page" | "theme_chunk" | "hifz_ayah";

export interface VocabExposureEvent {
  id: number;
  user_id: string;
  word_id: number;
  source_type: FahamSourceType;
  source_key: string;
  ayah_id: number | null;
  page_number: number | null;
  surah_id: number | null;
  theme_chunk_index: number | null;
  occurrence_count: number;
  exposed_at: string;
  created_at: string;
}

export interface VocabExposureSummary {
  user_id: string;
  word_id: number;
  exposure_event_count: number;
  distinct_context_count: number;
  distinct_source_count: number;
  total_occurrence_weight: number;
  reading_event_count: number;
  theme_event_count: number;
  hifz_event_count: number;
  reading_occurrence_weight: number;
  theme_occurrence_weight: number;
  hifz_occurrence_weight: number;
  last_exposed_at: string;
}

export interface ReviewLog {
  id: string;
  user_id: string;
  review_type: "ayah" | "vocab";
  item_id: number;
  rating: FsrsRating;
  state_before: FsrsState;
  state_after: FsrsState;
  elapsed_days: number;
  scheduled_days: number;
  reviewed_at: string;
}

export interface Profile {
  id: string;
  display_name: string | null;
  daily_goal_count: number | null;
  daily_goal_type: string | null;
  locale: string;
  created_at: string;
  updated_at: string;
}

export interface UserReadingState {
  user_id: string;
  last_page: number | null;
  last_read_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ThemeChunkProgress {
  id: number;
  user_id: string;
  surah_id: number;
  chunk_index: number;
  status: ThemeChunkProgressStatus;
  first_opened_at: string;
  last_opened_at: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export type ActivityEventType =
  | "faham_word_reviewed"
  | "hifz_ayah_memorized"
  | "hifz_ayah_reviewed"
  | "read_page_viewed"
  | "theme_chunk_completed"
  | "theme_chunk_started";

export type ActivityEntityType = "ayah" | "page" | "theme_chunk" | "word";

export interface ActivityEvent {
  id: number;
  user_id: string;
  activity_date: string;
  occurred_at: string;
  activity_type: ActivityEventType;
  entity_type: ActivityEntityType;
  entity_id: number | null;
  entity_key: string;
  metadata: Record<string, unknown> | null;
  idempotency_key: string;
  created_at: string;
}

// ============================================================
// Layer 5: Cross-References
// ============================================================

export interface RootFamily {
  id: number;
  root: string;
  meaning_bm: string | null;
  meaning_en: string | null;
  word_count: number;
}

export type CrossRefRelationship =
  | "parallel"
  | "contrast"
  | "elaboration"
  | "abrogation"
  | "context";

export interface AyatCrossReference {
  id: number;
  ayah_id_from: number;
  ayah_id_to: number;
  relationship: CrossRefRelationship | null;
  notes: string | null;
}

export interface TafsirNote {
  id: number;
  ayah_id: number;
  source: string;
  text_bm: string | null;
  text_en: string | null;
  text_arabic: string | null;
}

// ============================================================
// Layer 6: Mutashabihat
// ============================================================

export interface Mutashabihat {
  id: number;
  pattern_text: string;
  description_bm: string | null;
  description_en: string | null;
  ayah_count: number;
  difficulty_rating: number | null;
}

export interface MutashabihatAyah {
  id: number;
  mutashabihat_id: number;
  ayah_id: number;
  word_start: number;
  word_end: number;
  variation_note: string | null;
}

// ============================================================
// System
// ============================================================

export type AssetType =
  | "page_image"
  | "page_manifest"
  | "ayah_image"
  | "ayah_manifest"
  | "word_image";

export type RenderingErrorType =
  | "missing"
  | "schema_invalid"
  | "corrupt"
  | "dimension_zero";

export interface RenderingError {
  id: string;
  asset_type: AssetType;
  asset_id: string;
  error_type: RenderingErrorType;
  consumer: "web" | "bot";
  context: string | null;
  created_at: string;
}

// ============================================================
// Manifests (for hitbox overlays)
// ============================================================

export interface PageManifest {
  page: number;
  surah_start: number;
  ayah_start: number;
  surah_end: number;
  ayah_end: number;
  schema_version: string;
  image_width: number;
  image_height: number;
  dpi: number;
  words: ManifestWord[];
}

export interface AyahManifest {
  surah: number;
  ayah: number;
  schema_version: string;
  image_width: number;
  image_height: number;
  words: ManifestWord[];
}

export interface ManifestWord {
  word_id: number;
  surah?: number;
  ayah?: number;
  word_position: number;
  x: number;
  y: number;
  width: number;
  height: number;
}
