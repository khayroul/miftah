CREATE TABLE vocab_exposure_events (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  word_id INT NOT NULL REFERENCES words(id),
  source_type TEXT NOT NULL CHECK (source_type IN (
    'reading_page', 'theme_chunk', 'hifz_ayah'
  )),
  source_key TEXT NOT NULL,
  ayah_id INT REFERENCES ayat(id),
  page_number INT,
  surah_id INT,
  theme_chunk_index INT,
  occurrence_count INT NOT NULL DEFAULT 1 CHECK (occurrence_count > 0),
  exposed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_vocab_exposure_events_user_word
  ON vocab_exposure_events(user_id, word_id, exposed_at DESC);
CREATE INDEX idx_vocab_exposure_events_user_source
  ON vocab_exposure_events(user_id, source_type, exposed_at DESC);
CREATE INDEX idx_vocab_exposure_events_word_context
  ON vocab_exposure_events(word_id, source_key);

CREATE VIEW v_vocab_exposure_summary AS
SELECT
  vee.user_id,
  vee.word_id,
  COUNT(*)::INT AS exposure_event_count,
  COUNT(DISTINCT vee.source_key)::INT AS distinct_context_count,
  COUNT(DISTINCT vee.source_type)::INT AS distinct_source_count,
  COALESCE(SUM(vee.occurrence_count), 0)::INT AS total_occurrence_weight,
  COUNT(*) FILTER (
    WHERE vee.source_type = 'reading_page'
  )::INT AS reading_event_count,
  COUNT(*) FILTER (
    WHERE vee.source_type = 'theme_chunk'
  )::INT AS theme_event_count,
  COUNT(*) FILTER (
    WHERE vee.source_type = 'hifz_ayah'
  )::INT AS hifz_event_count,
  COALESCE(SUM(vee.occurrence_count) FILTER (
    WHERE vee.source_type = 'reading_page'
  ), 0)::INT AS reading_occurrence_weight,
  COALESCE(SUM(vee.occurrence_count) FILTER (
    WHERE vee.source_type = 'theme_chunk'
  ), 0)::INT AS theme_occurrence_weight,
  COALESCE(SUM(vee.occurrence_count) FILTER (
    WHERE vee.source_type = 'hifz_ayah'
  ), 0)::INT AS hifz_occurrence_weight,
  MAX(vee.exposed_at) AS last_exposed_at
FROM vocab_exposure_events vee
GROUP BY vee.user_id, vee.word_id;

ALTER TABLE vocab_exposure_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own vocab exposure events"
  ON vocab_exposure_events FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own vocab exposure events"
  ON vocab_exposure_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);
