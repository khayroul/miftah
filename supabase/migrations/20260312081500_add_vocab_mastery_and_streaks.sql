-- Add mastery and streak tracking to faham engine
ALTER TABLE vocab_progress
ADD COLUMN is_mastered BOOLEAN DEFAULT FALSE,
ADD COLUMN correct_streak INTEGER DEFAULT 0,
ADD COLUMN incorrect_streak INTEGER DEFAULT 0;

-- Index for efficient stats and sampling
CREATE INDEX idx_vocab_progress_mastery ON vocab_progress (user_id, is_mastered);

-- Helper to track mastered cards
COMMENT ON COLUMN vocab_progress.is_mastered IS 'Stability > 21 days AND 3 consecutive correct reviews';
COMMENT ON COLUMN vocab_progress.correct_streak IS 'Number of consecutive correct (rating > 1) reviews';
COMMENT ON COLUMN vocab_progress.incorrect_streak IS 'Number of consecutive incorrect (rating = 1) reviews';
