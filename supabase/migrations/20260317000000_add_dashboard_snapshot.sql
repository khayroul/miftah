-- Add materialized dashboard snapshot columns to profiles.
-- The home page reads this precomputed JSON instead of running 10-15 queries.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS dashboard_snapshot   JSONB       DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS snapshot_computed_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN public.profiles.dashboard_snapshot IS
  'Precomputed HomeDashboardSnapshot JSON (~1-2KB). NULL = not yet computed.';
COMMENT ON COLUMN public.profiles.snapshot_computed_at IS
  'Timestamp of last snapshot computation. Used for staleness checks.';
