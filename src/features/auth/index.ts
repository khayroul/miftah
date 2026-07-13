/**
 * features/auth — PUBLIC INTERFACE (barrel)
 *
 * Phase-1 Wave-0 scaffold (empty). Supabase Auth (sign-in form, status button,
 * session helpers). SCAFFOLD ONLY today — the feature is ACTIVATED in Phase 2
 * (parent spec §Phase-2 Lane A) against the `data/supabase/rls.ts` session
 * seam this restructure creates. No behavior now.
 *
 * Boundary rules (spec §2, §4.4 — enforced by eslint.config.mjs):
 *  - Other features import `auth` only via this barrel (`@/features/auth`).
 *  - Within this feature use relative imports.
 *  - Session client lives in `@/data/supabase/rls.ts`; DB reads route through
 *    `@/data/repositories/auth`.
 *
 * See docs/superpowers/specs/2026-07-13-target-architecture-DRAFT.md §3.7, §8(1).
 */
export {};
