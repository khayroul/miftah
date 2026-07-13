/**
 * data/repositories — the typed repository layer (barrel placeholder)
 *
 * Phase-1 Wave-0 scaffold (empty). Per-domain typed repositories land here as
 * waves migrate (`faham.ts`, `hifz.ts`, `mushaf-read.ts`, `tema.ts`, `home.ts`,
 * `auth.ts`, `tasmi.ts`, `activity.ts`, `license.ts`). Each returns TYPED
 * domain objects (never a raw Supabase row / `any`, spec §4.2) and is — with
 * `data/supabase/` — the ONLY layer permitted to touch a Supabase client.
 * Features import repositories from here, never a client (spec §2, §4.4).
 *
 * `src/data/repositories/faham.ts` is the split repository facade to replicate.
 * See docs/superpowers/specs/2026-07-13-target-architecture-DRAFT.md §3.9.
 */
export {
  getCoverageTiers,
  getUnderstandingCoverage,
  UNDERSTANDING_COVERAGE_TIERS,
} from "./understanding";
export type {
  UnderstandingCoverage,
  UnderstandingCoverageTier,
} from "./understanding";
