-- Perf quick-wins: missing hot-path indexes + drop a duplicate index.
--
-- Source: docs/superpowers/specs/2026-07-13-load-time-perf-audit.md §4
-- (index/view gaps) + live confirmation against project axjuolsguunsvqhmeveq
-- via `pg_indexes` and the Supabase performance advisor (`unindexed_foreign_keys`,
-- `duplicate_index` lints), both re-run before writing this migration.
--
-- Scope: pure additive/safe DDL. No view changes, no app code changes — the
-- deeper v_vocab_exposure_summary rollup fix (audit F2/F3) is reserved for the
-- Phase-1 faham repository wave (Wave 5).
--
-- ============================================================================
-- F6 — words.frequency has no index
-- ============================================================================
-- getTopFahamWordIds (repository.ts:76) seq-scans + sorts all 21,977 `words`
-- rows on every call (measured 10.7ms each, called 5-8x per /faham load) to
-- get the top-N by frequency, then ships the result back as a 4,000-int
-- IN(...) list into nearly every hot faham query. An index-only scan on
-- (frequency DESC) turns the seq-scan+sort into a top-N index walk.
CREATE INDEX IF NOT EXISTS idx_words_frequency
  ON public.words (frequency DESC);

-- ============================================================================
-- F9 — unindexed FKs (confirmed via pg_indexes + advisor `unindexed_foreign_keys`)
-- ============================================================================
-- vocab_progress.word_id: FK `vocab_progress_word_id_fkey` has no covering
-- index. The only index touching word_id is the composite
-- UNIQUE(user_id, word_id), where word_id is the trailing column and cannot
-- serve a word_id-only lookup or the FK's cascade/restrict check.
CREATE INDEX IF NOT EXISTS idx_vocab_progress_word_id
  ON public.vocab_progress (word_id);

-- vocab_exposure_events.ayah_id: FK `vocab_exposure_events_ayah_id_fkey` has
-- no covering index at all (existing indexes are all user_id/word_id led).
CREATE INDEX IF NOT EXISTS idx_vocab_exposure_events_ayah_id
  ON public.vocab_exposure_events (ayah_id);

-- study_progress.ayah_id: FK `study_progress_ayah_id_fkey` has no covering
-- index. The only index touching ayah_id is the composite
-- UNIQUE(user_id, ayah_id), where ayah_id is the trailing column and cannot
-- serve an ayah_id-only lookup or the FK's cascade/restrict check.
CREATE INDEX IF NOT EXISTS idx_study_progress_ayah_id
  ON public.study_progress (ayah_id);

-- ============================================================================
-- F9 — duplicate index on user_activity_log (confirmed via advisor `duplicate_index`)
-- ============================================================================
-- Two byte-identical unique indexes cover (user_id, activity_date, activity_type):
--   - user_activity_log_user_id_activity_date_activity_type_key
--     (the real UNIQUE table constraint, from the inline
--     UNIQUE(user_id, activity_date, activity_type) in migration
--     20260312171800_add_global_streaks_and_goals.sql)
--   - user_activity_log_user_date_type_key
--     (a bare CREATE UNIQUE INDEX with no backing constraint and no origin
--     in any tracked migration — an out-of-band duplicate)
-- Drop the unconstrained duplicate; keep the constraint-backed one so the
-- UNIQUE guarantee stays enforced by an actual table constraint.
DROP INDEX IF EXISTS public.user_activity_log_user_date_type_key;
