-- Miftah — مفتاح
-- Initial Schema: All 6 data layers + FSRS + system tables
-- Run in Supabase SQL Editor

-- ============================================================
-- LAYER 1: Quranic Text
-- ============================================================

CREATE TABLE surahs (
  id INT PRIMARY KEY,
  name_arabic TEXT NOT NULL,
  name_transliteration TEXT NOT NULL,
  name_bm TEXT NOT NULL,
  name_en TEXT NOT NULL,
  revelation_type TEXT NOT NULL CHECK (revelation_type IN ('meccan', 'medinan')),
  ayah_count INT NOT NULL,
  juz_start INT NOT NULL,
  page_start INT NOT NULL,
  page_end INT NOT NULL,
  order_revealed INT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE ayat (
  id SERIAL PRIMARY KEY,
  surah_id INT NOT NULL REFERENCES surahs(id),
  ayah_number INT NOT NULL,
  text_uthmani TEXT NOT NULL,
  text_simple TEXT NOT NULL,
  translation_id TEXT,           -- raw Indonesian (Kemenag, preserved)
  translation_en TEXT,           -- raw English (Sahih International, preserved)
  display_bm TEXT,               -- AI-resolved Malaysian Malay (what user sees)
  bm_flagged BOOLEAN DEFAULT FALSE,
  bm_resolution_notes TEXT,      -- what AI changed and why
  bm_correction_note TEXT,       -- human reviewer's corrections
  page_number INT NOT NULL,
  juz_number INT NOT NULL,
  hizb_number INT,
  ruku_number INT,
  sajdah BOOLEAN DEFAULT FALSE,
  word_count INT DEFAULT 0,
  audio_url TEXT,                -- EveryAyah.com per-ayah URL
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(surah_id, ayah_number)
);

CREATE TABLE words (
  id SERIAL PRIMARY KEY,
  text_uthmani TEXT NOT NULL,
  text_simple TEXT NOT NULL,
  translation_bm TEXT,
  translation_en TEXT,
  transliteration TEXT,
  root TEXT,                     -- Arabic root letters
  lemma TEXT,
  pos TEXT,                      -- part of speech
  frequency INT DEFAULT 0,      -- total occurrences in Quran
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE word_occurrences (
  id SERIAL PRIMARY KEY,
  word_id INT NOT NULL REFERENCES words(id),
  ayah_id INT NOT NULL REFERENCES ayat(id),
  position INT NOT NULL,         -- 1-indexed word position in ayah
  page_number INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(ayah_id, position)
);

-- ============================================================
-- LAYER 2: Thematic
-- ============================================================

CREATE TABLE themes (
  id SERIAL PRIMARY KEY,
  name_bm TEXT NOT NULL,
  name_en TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN (
    'aqidah', 'ibadah', 'akhlak', 'muamalat', 'qasas', 'kawniyyat'
  )),
  description_bm TEXT,
  description_en TEXT,
  parent_id INT REFERENCES themes(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE theme_ayat (
  id SERIAL PRIMARY KEY,
  theme_id INT NOT NULL REFERENCES themes(id),
  ayah_id INT NOT NULL REFERENCES ayat(id),
  relevance TEXT CHECK (relevance IN ('primary', 'secondary')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(theme_id, ayah_id)
);

CREATE TABLE asbab_nuzul (
  id SERIAL PRIMARY KEY,
  ayah_id INT NOT NULL REFERENCES ayat(id),
  text_bm TEXT NOT NULL,
  text_en TEXT,
  source TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- LAYER 3: Hadith
-- ============================================================

CREATE TABLE hadith_sources (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,     -- e.g. 'Sahih al-Bukhari'
  name_arabic TEXT,
  compiler TEXT,
  hadith_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE hadith_kitab (
  id SERIAL PRIMARY KEY,
  source_id INT NOT NULL REFERENCES hadith_sources(id),
  name_bm TEXT NOT NULL,
  name_en TEXT,
  name_arabic TEXT,
  kitab_number INT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE hadith (
  id SERIAL PRIMARY KEY,
  source_id INT NOT NULL REFERENCES hadith_sources(id),
  kitab_id INT REFERENCES hadith_kitab(id),
  hadith_number INT,
  text_arabic TEXT,
  text_bm TEXT,
  text_en TEXT,
  narrator TEXT,
  grade TEXT,                    -- sahih, hasan, etc.
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE hadith_ayat_links (
  id SERIAL PRIMARY KEY,
  hadith_id INT NOT NULL REFERENCES hadith(id),
  ayah_id INT NOT NULL REFERENCES ayat(id),
  link_type TEXT CHECK (link_type IN ('tafsir', 'hukm', 'context', 'general')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(hadith_id, ayah_id)
);

-- ============================================================
-- LAYER 4: Progress (FSRS)
-- ============================================================

CREATE TABLE study_progress (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  ayah_id INT NOT NULL REFERENCES ayat(id),
  -- FSRS fields
  stability FLOAT DEFAULT 0.0,
  difficulty FLOAT DEFAULT 0.0,
  elapsed_days INT DEFAULT 0,
  scheduled_days INT DEFAULT 0,
  reps INT DEFAULT 0,
  lapses INT DEFAULT 0,
  state INT DEFAULT 0,          -- 0=New 1=Learning 2=Review 3=Relearning
  due TIMESTAMPTZ DEFAULT NOW(),
  last_review TIMESTAMPTZ,
  -- Hifz tracking
  hifz_status TEXT DEFAULT 'not_started' CHECK (hifz_status IN (
    'not_started', 'sabak', 'sabqi', 'manzil'
  )),
  sabak_started_at TIMESTAMPTZ,
  moved_to_sabqi_at TIMESTAMPTZ,
  moved_to_manzil_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, ayah_id)
);

CREATE TABLE vocab_progress (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  word_id INT NOT NULL REFERENCES words(id),
  -- FSRS fields (identical to study_progress)
  stability FLOAT DEFAULT 0.0,
  difficulty FLOAT DEFAULT 0.0,
  elapsed_days INT DEFAULT 0,
  scheduled_days INT DEFAULT 0,
  reps INT DEFAULT 0,
  lapses INT DEFAULT 0,
  state INT DEFAULT 0,
  due TIMESTAMPTZ DEFAULT NOW(),
  last_review TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, word_id)
);

CREATE TABLE review_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  review_type TEXT NOT NULL CHECK (review_type IN ('ayah', 'vocab')),
  item_id INT NOT NULL,          -- ayah_id or word_id
  rating INT NOT NULL CHECK (rating BETWEEN 1 AND 4),
  state_before INT NOT NULL,
  state_after INT NOT NULL,
  elapsed_days INT NOT NULL,
  scheduled_days INT NOT NULL,
  reviewed_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- LAYER 5: Cross-References
-- ============================================================

CREATE TABLE root_families (
  id SERIAL PRIMARY KEY,
  root TEXT NOT NULL UNIQUE,     -- Arabic root letters
  meaning_bm TEXT,
  meaning_en TEXT,
  word_count INT DEFAULT 0,      -- how many word forms share this root
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE ayat_cross_references (
  id SERIAL PRIMARY KEY,
  ayah_id_from INT NOT NULL REFERENCES ayat(id),
  ayah_id_to INT NOT NULL REFERENCES ayat(id),
  relationship TEXT CHECK (relationship IN (
    'parallel', 'contrast', 'elaboration', 'abrogation', 'context'
  )),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(ayah_id_from, ayah_id_to)
);

CREATE TABLE tafsir_notes (
  id SERIAL PRIMARY KEY,
  ayah_id INT NOT NULL REFERENCES ayat(id),
  source TEXT NOT NULL,          -- e.g. 'Ibn Kathir', 'Al-Tabari'
  text_bm TEXT,
  text_en TEXT,
  text_arabic TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- LAYER 6: Mutashabihat (Similar Phrases)
-- ============================================================

CREATE TABLE mutashabihat (
  id SERIAL PRIMARY KEY,
  pattern_text TEXT NOT NULL,    -- the shared Arabic phrase
  description_bm TEXT,
  description_en TEXT,
  ayah_count INT DEFAULT 0,
  difficulty_rating INT CHECK (difficulty_rating BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE mutashabihat_ayat (
  id SERIAL PRIMARY KEY,
  mutashabihat_id INT NOT NULL REFERENCES mutashabihat(id),
  ayah_id INT NOT NULL REFERENCES ayat(id),
  word_start INT NOT NULL,       -- starting word position
  word_end INT NOT NULL,         -- ending word position
  variation_note TEXT,           -- what's different about this occurrence
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(mutashabihat_id, ayah_id)
);

-- ============================================================
-- SYSTEM: Rendering Errors
-- ============================================================

CREATE TABLE rendering_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_type TEXT NOT NULL CHECK (asset_type IN (
    'page_image', 'page_manifest', 'ayah_image', 'ayah_manifest', 'word_image'
  )),
  asset_id TEXT NOT NULL,
  error_type TEXT NOT NULL CHECK (error_type IN (
    'missing', 'schema_invalid', 'corrupt', 'dimension_zero'
  )),
  consumer TEXT NOT NULL CHECK (consumer IN ('web', 'bot')),
  context TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================

-- Quranic text lookups
CREATE INDEX idx_ayat_surah ON ayat(surah_id);
CREATE INDEX idx_ayat_page ON ayat(page_number);
CREATE INDEX idx_ayat_juz ON ayat(juz_number);
CREATE INDEX idx_word_occ_ayah ON word_occurrences(ayah_id);
CREATE INDEX idx_word_occ_word ON word_occurrences(word_id);
CREATE INDEX idx_words_root ON words(root);

-- Theme lookups
CREATE INDEX idx_theme_ayat_theme ON theme_ayat(theme_id);
CREATE INDEX idx_theme_ayat_ayah ON theme_ayat(ayah_id);
CREATE INDEX idx_themes_category ON themes(category);

-- Hadith lookups
CREATE INDEX idx_hadith_source ON hadith(source_id);
CREATE INDEX idx_hadith_links_ayah ON hadith_ayat_links(ayah_id);
CREATE INDEX idx_hadith_links_hadith ON hadith_ayat_links(hadith_id);

-- Progress lookups
CREATE INDEX idx_study_progress_user ON study_progress(user_id);
CREATE INDEX idx_study_progress_due ON study_progress(user_id, due);
CREATE INDEX idx_study_progress_status ON study_progress(user_id, hifz_status);
CREATE INDEX idx_vocab_progress_user ON vocab_progress(user_id);
CREATE INDEX idx_vocab_progress_due ON vocab_progress(user_id, due);
CREATE INDEX idx_review_log_user ON review_log(user_id);
CREATE INDEX idx_review_log_item ON review_log(review_type, item_id);

-- Cross-reference lookups
CREATE INDEX idx_cross_refs_from ON ayat_cross_references(ayah_id_from);
CREATE INDEX idx_cross_refs_to ON ayat_cross_references(ayah_id_to);

-- Mutashabihat lookups
CREATE INDEX idx_mutashabihat_ayat_mut ON mutashabihat_ayat(mutashabihat_id);
CREATE INDEX idx_mutashabihat_ayat_ayah ON mutashabihat_ayat(ayah_id);

-- Rendering errors
CREATE INDEX idx_rendering_errors_type ON rendering_errors(asset_type);

-- ============================================================
-- VIEWS
-- ============================================================

-- Juz progress overview for hifz dashboard
CREATE VIEW v_juz_progress AS
SELECT
  a.juz_number,
  sp.user_id,
  COUNT(*) AS total_ayat,
  COUNT(*) FILTER (WHERE sp.hifz_status = 'manzil') AS manzil_count,
  COUNT(*) FILTER (WHERE sp.hifz_status = 'sabqi') AS sabqi_count,
  COUNT(*) FILTER (WHERE sp.hifz_status = 'sabak') AS sabak_count,
  COUNT(*) FILTER (WHERE sp.hifz_status = 'not_started') AS not_started_count,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE sp.hifz_status = 'manzil') / COUNT(*), 1
  ) AS manzil_pct
FROM ayat a
LEFT JOIN study_progress sp ON sp.ayah_id = a.id
GROUP BY a.juz_number, sp.user_id;

-- Word frequency ranking for vocab coverage
CREATE VIEW v_word_rank_coverage AS
SELECT
  w.id AS word_id,
  w.text_uthmani,
  w.text_simple,
  w.root,
  w.pos,
  w.frequency,
  RANK() OVER (ORDER BY w.frequency DESC) AS freq_rank,
  vp.user_id,
  vp.state AS fsrs_state,
  vp.stability,
  vp.due
FROM words w
LEFT JOIN vocab_progress vp ON vp.word_id = w.id;

-- ============================================================
-- RLS (written now, activated with auth later)
-- ============================================================

ALTER TABLE study_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE vocab_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_log ENABLE ROW LEVEL SECURITY;

-- Policies: user can only access their own data
CREATE POLICY "Users can view own study progress"
  ON study_progress FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own study progress"
  ON study_progress FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own study progress"
  ON study_progress FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view own vocab progress"
  ON vocab_progress FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own vocab progress"
  ON vocab_progress FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own vocab progress"
  ON vocab_progress FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view own review log"
  ON review_log FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own review log"
  ON review_log FOR INSERT
  WITH CHECK (auth.uid() = user_id);
