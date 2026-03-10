-- Helper for migrating legacy single-user progress rows onto a real
-- Supabase auth user after auth goes live.
--
-- Safety rule:
-- - target auth user must already exist in auth.users
-- - target auth user must not already have progress rows
-- - run manually from Supabase SQL editor after first sign-up

CREATE OR REPLACE FUNCTION public.backfill_legacy_user_progress(
  legacy_user_id UUID,
  target_auth_user_id UUID
)
RETURNS TABLE (
  study_progress_rows BIGINT,
  vocab_progress_rows BIGINT,
  review_log_rows BIGINT,
  vocab_exposure_event_rows BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  moved_study_progress BIGINT := 0;
  moved_vocab_progress BIGINT := 0;
  moved_review_log BIGINT := 0;
  moved_vocab_exposure_events BIGINT := 0;
BEGIN
  IF legacy_user_id IS NULL OR target_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'Both legacy_user_id and target_auth_user_id are required.';
  END IF;

  IF legacy_user_id = target_auth_user_id THEN
    RAISE EXCEPTION 'legacy_user_id and target_auth_user_id must be different.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM auth.users
    WHERE id = target_auth_user_id
  ) THEN
    RAISE EXCEPTION 'Target auth user % does not exist in auth.users.', target_auth_user_id;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.study_progress
    WHERE user_id = target_auth_user_id
  ) OR EXISTS (
    SELECT 1
    FROM public.vocab_progress
    WHERE user_id = target_auth_user_id
  ) OR EXISTS (
    SELECT 1
    FROM public.review_log
    WHERE user_id = target_auth_user_id
  ) OR EXISTS (
    SELECT 1
    FROM public.vocab_exposure_events
    WHERE user_id = target_auth_user_id
  ) THEN
    RAISE EXCEPTION
      'Target auth user % already has progress data. Aborting backfill to avoid merge conflicts.',
      target_auth_user_id;
  END IF;

  INSERT INTO public.profiles (id)
  VALUES (target_auth_user_id)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_reading_state (user_id)
  VALUES (target_auth_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  UPDATE public.study_progress
  SET user_id = target_auth_user_id
  WHERE user_id = legacy_user_id;
  GET DIAGNOSTICS moved_study_progress = ROW_COUNT;

  UPDATE public.vocab_progress
  SET user_id = target_auth_user_id
  WHERE user_id = legacy_user_id;
  GET DIAGNOSTICS moved_vocab_progress = ROW_COUNT;

  UPDATE public.review_log
  SET user_id = target_auth_user_id
  WHERE user_id = legacy_user_id;
  GET DIAGNOSTICS moved_review_log = ROW_COUNT;

  UPDATE public.vocab_exposure_events
  SET user_id = target_auth_user_id
  WHERE user_id = legacy_user_id;
  GET DIAGNOSTICS moved_vocab_exposure_events = ROW_COUNT;

  RETURN QUERY
  SELECT
    moved_study_progress,
    moved_vocab_progress,
    moved_review_log,
    moved_vocab_exposure_events;
END;
$$;

REVOKE ALL ON FUNCTION public.backfill_legacy_user_progress(UUID, UUID)
  FROM PUBLIC, anon, authenticated;
