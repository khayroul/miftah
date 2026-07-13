-- Re-key theme_chunk_progress by a STABLE content identifier (RF-5) and add
-- per-event idempotency to vocab_exposure_events (B6 follow-up from RF-2).
--
-- ============================================================================
-- RF-5 — Tema progress stable-id keying
-- ============================================================================
-- theme_chunk_progress was keyed by the volatile positional chunk_index
-- (recomputed every request in queries.ts::withChunkIndex, `chunk_index: index
-- + 1`). Any future edit to chunk definitions — a new override inserted, an
-- auto-chunk boundary shift — silently re-attributes a user's existing progress
-- to a DIFFERENT ayah range, because the same positional index now points at a
-- different span.
--
-- Fix: re-key by the STABLE content triple (surah_id, start_ayah, end_ayah).
-- Every displayed chunk carries this triple regardless of type (auto-generated,
-- dataset-backed, and manual-override chunks alike). Note that
-- ayah_theme_chunks.id is NOT a viable key: it is a SERIAL that is not stable
-- across re-seeds AND does not exist at all for auto-generated chunks (which are
-- built purely from ayah theme transitions and have no dataset row). The content
-- triple is the only identifier available for every chunk the user can open.
--
-- RESET vs BACKFILL: we RESET (truncate) existing progress rows rather than
-- backfill. Rationale:
--   1. Operator waiver 2026-07-13 — all current users are beta testers, the data
--      is disposable, and no pre-migration backup is required.
--   2. A correct backfill would have to re-run the app-side chunk builder
--      (queries.ts) once per row to map (surah_id, chunk_index) ->
--      (start_ayah, end_ayah). That logic is not expressible in SQL, so reset is
--      the simplest correct path.
--
-- ============================================================================
-- B6 (RF-2 follow-up) — vocab_exposure_events per-event idempotency
-- ============================================================================
-- vocab_exposure_events had no per-event id, so the RF-2 exposure dedup was only
-- best-effort (a natural-key window on source_key). Add event_id plus a partial
-- UNIQUE index so a network retry carrying the same X-Miftah-Exposure-Event-Id
-- is a true no-op. The application writes one row per exposed word, stamping each
-- with a composite `${eventId}#${word_id}` so all word rows of one event coexist
-- while a retried event aborts the INSERT on the unique index (23505), which the
-- repository catches and reports as deduped. Legacy rows keep event_id NULL; the
-- partial index does not cover them, so the best-effort window guard remains
-- their fallback.
--
-- ============================================================================
-- Reversibility: the RF-5 columns/constraints/indexes and the B6 column/index
-- are all additive and droppable. The RESET (TRUNCATE) of theme_chunk_progress
-- is intentionally NOT reversible (disposable beta data, operator-waived).
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- RF-5: theme_chunk_progress stable content key
-- ---------------------------------------------------------------------------

-- Disposable-data reset (see header). Emptying the table lets us add NOT NULL
-- stable-key columns and swap the unique constraint without a backfill.
TRUNCATE TABLE public.theme_chunk_progress RESTART IDENTITY;

-- Stable content-key columns.
ALTER TABLE public.theme_chunk_progress
  ADD COLUMN IF NOT EXISTS start_ayah INT,
  ADD COLUMN IF NOT EXISTS end_ayah INT;

-- Table is empty after the reset, so NOT NULL is safe to enforce immediately.
ALTER TABLE public.theme_chunk_progress
  ALTER COLUMN start_ayah SET NOT NULL,
  ALTER COLUMN end_ayah SET NOT NULL;

-- chunk_index is now a non-authoritative DISPLAY HINT (the UI still uses it as a
-- scroll/select anchor), not the storage key. Drop its NOT NULL so the column's
-- volatility can never again constrain a row's identity.
ALTER TABLE public.theme_chunk_progress
  ALTER COLUMN chunk_index DROP NOT NULL;

-- Range sanity for the new content key.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'theme_chunk_progress_ayah_range_chk'
  ) THEN
    ALTER TABLE public.theme_chunk_progress
      ADD CONSTRAINT theme_chunk_progress_ayah_range_chk
      CHECK (start_ayah > 0 AND end_ayah >= start_ayah);
  END IF;
END
$$;

-- Swap the unique key: (user_id, surah_id, chunk_index) -> stable content key.
-- The old constraint name is the deterministic auto-name from the inline
-- UNIQUE(user_id, surah_id, chunk_index) in 20260311104000.
ALTER TABLE public.theme_chunk_progress
  DROP CONSTRAINT IF EXISTS theme_chunk_progress_user_id_surah_id_chunk_index_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'theme_chunk_progress_user_surah_ayah_range_key'
  ) THEN
    ALTER TABLE public.theme_chunk_progress
      ADD CONSTRAINT theme_chunk_progress_user_surah_ayah_range_key
      UNIQUE (user_id, surah_id, start_ayah, end_ayah);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_theme_chunk_progress_user_surah_range
  ON public.theme_chunk_progress(user_id, surah_id, start_ayah, end_ayah);

-- ---------------------------------------------------------------------------
-- B6 / RF-2: vocab_exposure_events per-event idempotency
-- ---------------------------------------------------------------------------

ALTER TABLE public.vocab_exposure_events
  ADD COLUMN IF NOT EXISTS event_id TEXT;

-- Partial UNIQUE index: dedups only rows that carry a per-event id. Legacy rows
-- (event_id IS NULL) are excluded and fall back to the best-effort window guard.
CREATE UNIQUE INDEX IF NOT EXISTS uq_vocab_exposure_events_user_event
  ON public.vocab_exposure_events(user_id, event_id)
  WHERE event_id IS NOT NULL;

COMMIT;
