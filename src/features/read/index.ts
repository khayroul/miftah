/**
 * features/read — PUBLIC INTERFACE (barrel)
 *
 * Phase-1 Wave-0 scaffold (empty). This is the ONLY import surface for the
 * `read` feature: mushaf reading chrome, audio dock, navigation — NOT the QCF
 * renderer internals (those live frozen in `src/mushaf`).
 *
 * Boundary rules (spec §2, §4.4 — enforced by eslint.config.mjs):
 *  - Other features import `read` only via this barrel (`@/features/read`),
 *    never its internals.
 *  - Within this feature use relative imports (`./domain/...`, `./components/...`).
 *  - Never import a Supabase client here — consume `@/data/repositories/*`.
 *
 * Exports land here in Wave 7 (read is the integration hub, migrated LAST).
 * See docs/superpowers/specs/2026-07-13-target-architecture-DRAFT.md §3.1.
 */
export {};
