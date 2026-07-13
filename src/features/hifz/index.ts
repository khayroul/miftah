/**
 * features/hifz — PUBLIC INTERFACE (barrel)
 *
 * Phase-1 Wave-0 scaffold (empty). Memorization overview, memorize stepper,
 * tebuk/unveil sessions, scheduler-driven queues.
 *
 * Boundary rules (spec §2, §4.4 — enforced by eslint.config.mjs):
 *  - Other features import `hifz` only via this barrel (`@/features/hifz`).
 *  - Within this feature use relative imports.
 *  - Never import a Supabase client here — consume `@/data/repositories/hifz`
 *    (removes the current component→Supabase leak, spec §3.2).
 *
 * Exports land here in Wave 6.
 * See docs/superpowers/specs/2026-07-13-target-architecture-DRAFT.md §3.2.
 */
export {};
