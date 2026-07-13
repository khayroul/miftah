/**
 * features/tasmi — PUBLIC INTERFACE (barrel)
 *
 * Phase-1 Wave-0 scaffold (empty). Recitation-checking CLIENT lib only
 * (recorder, session, sequence-matcher, arabic-normalizer, talqin-player).
 * It posts audio to the Next route `app/api/tasmi/transcribe`, which proxies
 * to the EXTERNAL FastAPI deployable `tasmi-server/` (faster-whisper) — that
 * Python service is out of this tree (spec §1.9, §3.5).
 *
 * Boundary rules (spec §2, §4.4 — enforced by eslint.config.mjs):
 *  - Other features import `tasmi` only via this barrel (`@/features/tasmi`).
 *  - Within this feature use relative imports.
 *  - Session writes route through `@/data/repositories/tasmi`, never a client.
 *
 * Exports land here in Wave 3.
 * See docs/superpowers/specs/2026-07-13-target-architecture-DRAFT.md §3.5.
 */
export {};
