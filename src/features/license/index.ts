/**
 * features/license — PUBLIC INTERFACE (barrel)
 *
 * Phase-1 Wave-0 scaffold. EMPTY feature — NEW in Phase 2 (parent spec
 * §Phase-2 Lane B). Only its seam exists now: this barrel + a typed repository
 * stub at `./data/repository.ts`, so the Phase-2 build lands as a clean module
 * against a named contract. NO behavior today.
 *
 * Boundary rules (spec §2, §4.4 — enforced by eslint.config.mjs):
 *  - Consumers import license only via this barrel (`@/features/license`).
 *  - License persistence routes through the repository (which will re-export
 *    `@/data/repositories/license` in Phase 2), never a Supabase client here.
 *
 * See docs/superpowers/specs/2026-07-13-target-architecture-DRAFT.md §3.8.
 */
export type { LicenseRecord, LicenseRepository } from "./data/repository";
