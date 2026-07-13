/**
 * features/faham — PUBLIC INTERFACE (barrel)
 *
 * Phase-1 Wave-0 scaffold (empty). Vocabulary comprehension workspace
 * (exposure tracking, MCQ, spaced review). `lib/faham/repository.ts` is the
 * reference repository shape the whole `data/` layer replicates.
 *
 * Boundary rules (spec §2, §4.4 — enforced by eslint.config.mjs):
 *  - Other features import `faham` only via this barrel (`@/features/faham`).
 *  - Within this feature use relative imports.
 *  - Never import a Supabase client here — consume `@/data/repositories/faham`.
 *
 * Exports land here in Wave 5 (biggest single decomposition).
 * See docs/superpowers/specs/2026-07-13-target-architecture-DRAFT.md §3.3.
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
