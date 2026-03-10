-- Clean-slate multi-user auth hardening.
-- This migration intentionally clears existing user progress/state data so the
-- app can restart from zero with auth.users as the only valid user source.

TRUNCATE TABLE
  public.review_log,
  public.vocab_exposure_events,
  public.vocab_progress,
  public.study_progress,
  public.theme_chunk_progress,
  public.user_reading_state
RESTART IDENTITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'study_progress_user_id_auth_fkey'
  ) THEN
    ALTER TABLE public.study_progress
      ADD CONSTRAINT study_progress_user_id_auth_fkey
      FOREIGN KEY (user_id)
      REFERENCES auth.users(id)
      ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'vocab_progress_user_id_auth_fkey'
  ) THEN
    ALTER TABLE public.vocab_progress
      ADD CONSTRAINT vocab_progress_user_id_auth_fkey
      FOREIGN KEY (user_id)
      REFERENCES auth.users(id)
      ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'review_log_user_id_auth_fkey'
  ) THEN
    ALTER TABLE public.review_log
      ADD CONSTRAINT review_log_user_id_auth_fkey
      FOREIGN KEY (user_id)
      REFERENCES auth.users(id)
      ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'vocab_exposure_events_user_id_auth_fkey'
  ) THEN
    ALTER TABLE public.vocab_exposure_events
      ADD CONSTRAINT vocab_exposure_events_user_id_auth_fkey
      FOREIGN KEY (user_id)
      REFERENCES auth.users(id)
      ON DELETE CASCADE;
  END IF;
END
$$;
