CREATE TABLE public.activity_events (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  activity_date DATE NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  activity_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id BIGINT,
  entity_key TEXT NOT NULL,
  metadata JSONB,
  idempotency_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, idempotency_key)
);

CREATE INDEX idx_activity_events_user_date
  ON public.activity_events(user_id, activity_date DESC);

CREATE INDEX idx_activity_events_user_type_date
  ON public.activity_events(user_id, activity_type, activity_date DESC);

ALTER TABLE public.activity_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own activity events"
  ON public.activity_events FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own activity events"
  ON public.activity_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE VIEW public.v_daily_activity_summary AS
SELECT
  user_id,
  activity_date,
  COUNT(*) AS total_events,
  COUNT(DISTINCT entity_key) FILTER (
    WHERE activity_type = 'read_page_viewed'
  ) AS read_pages_count,
  COUNT(DISTINCT entity_key) FILTER (
    WHERE activity_type = 'faham_word_reviewed'
  ) AS faham_words_count,
  COUNT(DISTINCT entity_key) FILTER (
    WHERE activity_type IN ('theme_chunk_started', 'theme_chunk_completed')
  ) AS theme_chunks_count,
  COUNT(DISTINCT entity_key) FILTER (
    WHERE activity_type IN ('hifz_ayah_reviewed', 'hifz_ayah_memorized')
  ) AS hifz_ayat_count
FROM public.activity_events
GROUP BY user_id, activity_date;
;
