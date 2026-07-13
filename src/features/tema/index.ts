/**
 * features/tema — PUBLIC INTERFACE (barrel)
 *
 * Phase-1 Wave-0 scaffold (empty). Quranic thematic study (the "tema" DOMAIN).
 * Distinct from `ui/theme` (UI color mode) — this split resolves the
 * theme/tema naming collision (spec §1.10, §8 resolution).
 *
 * Boundary rules (spec §2, §4.4 — enforced by eslint.config.mjs):
 *  - Other features import `tema` only via this barrel (`@/features/tema`).
 *  - Within this feature use relative imports.
 *  - Never import a Supabase client here — consume `@/data/repositories/tema`.
 *
 * Route-facing component exports land here in Wave 2 (lowest domain risk —
 * first strangler wave).
 * See docs/superpowers/specs/2026-07-13-target-architecture-DRAFT.md §3.4.
 */
export { TemaDataFetcher } from "./components/TemaDataFetcher";
