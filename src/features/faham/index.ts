/**
 * features/faham — PUBLIC INTERFACE (barrel)
 *
 * Client-safe public interface for vocabulary comprehension. Server-only
 * coverage and orchestration exports live in `./server`.
 *
 * Boundary rules (spec §2, §4.4 — enforced by eslint.config.mjs):
 *  - Other features import `faham` only via this barrel (`@/features/faham`).
 *  - Within this feature use relative imports.
 *  - Never import a Supabase client here — consume `@/data/repositories/faham`.
 *
 * Exports land here in Wave 5 (biggest single decomposition).
 * See docs/superpowers/specs/2026-07-13-target-architecture-DRAFT.md §3.3.
 */
export { FahamExposureTracker } from "./components/FahamExposureTracker";
