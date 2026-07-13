/**
 * features/read — PUBLIC INTERFACE (barrel)
 *
 * This is the ONLY import surface for the
 * `read` feature: mushaf reading chrome, audio dock, navigation — NOT the QCF
 * renderer internals (those live frozen in `src/mushaf`).
 *
 * Boundary rules (spec §2, §4.4 — enforced by eslint.config.mjs):
 *  - Other features import `read` only via this barrel (`@/features/read`),
 *    never its internals.
 *  - Within this feature use relative imports (`./domain/...`, `./components/...`).
 *  - Never import a Supabase client here — consume `@/data/repositories/*`.
 *
 * Wave 7 public surface. Server-only data access remains in repositories.
 * See docs/superpowers/specs/2026-07-13-target-architecture-DRAFT.md §3.1.
 */
export { LightweightBreadcrumb } from "./components/LightweightBreadcrumb";
export { ModeNavigator } from "./components/ModeNavigator";
export { PageAudioControls } from "./components/PageAudioControls";
export type { PageAudioTrack } from "./components/PageAudioControls";
export { ReadAudioProvider, useReadAudio } from "./components/ReadAudioProvider";
export { ReadJumpControls } from "./components/ReadJumpControls";
export { ReadPageWorkspace } from "./components/ReadPageWorkspace";
export { ReadingStateSync } from "./components/ReadingStateSync";
export {
  mapAyatToPageAudioTracks,
} from "./domain/audio/pageAudioTracks";
export type { ReadAudioTrack } from "./domain/audio/pageAudioTracks";
export { getQuranWordAudioUrl } from "./domain/audio/quranWordAudio";
export { FALLBACK_READ_JUMP_TARGETS } from "./domain/readJumpTargetsFallback";
export {
  findMarkerForPage,
  getMarkerPageById,
  parseBoundedIntegerInput,
} from "./domain/readNavigationUtils";
export {
  defaultReadMode,
  loadReadMode,
  saveReadMode,
} from "./domain/readMode";
export type { ReadMode } from "./domain/readMode";
export {
  loadReadingProgress,
  rememberLastReadPage,
} from "./domain/readingProgressStorage";
export { useReadingProgressState } from "./domain/useReadingProgressState";
