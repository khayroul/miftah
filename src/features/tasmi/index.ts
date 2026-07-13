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
 * See docs/superpowers/specs/2026-07-13-target-architecture-DRAFT.md §3.5.
 */
export { HifzTasmiOverlay } from "./components/HifzTasmiOverlay";
export { TasmiSessionUI } from "./components/TasmiSessionUI";
export type { AyahRange } from "./components/TasmiSessionUI";
export { normalizeArabic, tokenizeWords } from "./domain/arabic-normalizer";
export {
  getPerAyahRatings,
  tasmiResultToFsrsRating,
  tasmiResultToLabel,
} from "./domain/fsrs-bridge";
export type { TasmiRatingLabel } from "./domain/fsrs-bridge";
export { SequenceMatcher } from "./domain/sequence-matcher";
export type { MatchResult } from "./domain/sequence-matcher";
export { TalqinPlayer } from "./domain/talqin-player";
export type {
  AyahTimestamps,
  TalqinConfig,
  WordSegment,
} from "./domain/talqin-player";
export { TasmiRecorder } from "./domain/tasmi-recorder";
export type { RecorderConfig } from "./domain/tasmi-recorder";
export { TasmiSession } from "./domain/tasmi-session";
export type {
  TasmiConfig,
  TasmiEvent,
  TasmiEventHandler,
  TasmiEventType,
  TasmiSessionResult,
} from "./domain/tasmi-session";
