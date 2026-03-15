-- Tasmi' session results — stores recitation checking outcomes
CREATE TABLE tasmi_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  surah_number INTEGER NOT NULL,
  start_ayah INTEGER NOT NULL,
  end_ayah INTEGER NOT NULL,
  total_words INTEGER NOT NULL,
  words_correct INTEGER NOT NULL,
  accuracy DECIMAL(5,2) NOT NULL,
  talqin_count INTEGER NOT NULL DEFAULT 0,
  error_positions INTEGER[] DEFAULT '{}',
  duration_seconds INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for querying user's recent sessions
CREATE INDEX idx_tasmi_sessions_user ON tasmi_sessions(user_id, created_at DESC);

-- RLS policies
ALTER TABLE tasmi_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own tasmi sessions"
  ON tasmi_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can read own tasmi sessions"
  ON tasmi_sessions FOR SELECT
  USING (auth.uid() = user_id);
