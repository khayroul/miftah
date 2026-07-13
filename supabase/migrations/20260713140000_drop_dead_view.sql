-- Drop the dead v_word_rank_coverage view (0 code refs, 0 dependents; re-sorts all
-- 21,977 words per call for nothing). Confirmed dead by PERF-D sweep 2026-07-13.
--
-- NOTE: the perf index migration (20260713130000) + this drop were applied to
-- production out-of-band on 2026-07-13 (operator-authorized, ahead of the full
-- deploy) via a single idempotent `perf_indexes_and_drop_dead_view` migration.
-- These files remain for repo<->fresh-rebuild consistency and are idempotent, so
-- re-running them at deploy is a safe no-op. Reconcile remote history with
-- `supabase db pull` if desired.

DROP VIEW IF EXISTS public.v_word_rank_coverage;
