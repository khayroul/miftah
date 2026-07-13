/**
 * features/hifz — PUBLIC INTERFACE (barrel)
 *
 * Public, client-safe Hifz boundary. Server-only repository functions remain in
 * `@/data/repositories/hifz`; routes and server components consume them there.
 *
 * Boundary rules (spec §2, §4.4 — enforced by eslint.config.mjs):
 *  - Other features import `hifz` only via this barrel (`@/features/hifz`).
 *  - Within this feature use relative imports.
 *  - Never import a Supabase client here — consume `@/data/repositories/hifz`
 *    (removes the current component→Supabase leak, spec §3.2).
 *
 * See docs/superpowers/specs/2026-07-13-target-architecture-DRAFT.md §3.2.
 */
// Lazy public component loaders keep domain-only consumers from registering the
// Tasmi/ONNX client graph while still giving Read a stable feature boundary.
export {
  loadHifzInlineRating,
  loadHifzMemorizeStepper,
  loadHifzSessionBar,
  loadHifzSessionComplete,
  loadHifzTebukSession,
  loadHifzUnveilSession,
} from "./read-loaders";
export { preCacheAudioUrls } from "./domain/audioPreCache";
export { JUZ_BOUNDARY_PAGES } from "./domain/constants";
export {
  getDifficultAyahs,
  isDifficultAyah,
  toggleDifficultAyah,
} from "./domain/difficultAyahs";
export {
  buildHifzPlanSnapshot,
  buildHifzQueueResponse,
  countUniquePlanItemPages,
} from "./domain/queue";
export type { HifzQueueResponse } from "./domain/queue";
export {
  calculateHifzRevealStageByAyahKeys,
  resolveApproxThirdBoundariesByAyahEnd,
} from "./domain/pageReveal";
export type { HifzRevealStage } from "./domain/pageReveal";
export {
  advanceQueue,
  areAllProgressIdsRated,
  buildRecoveredRatedProgressIds,
  buildQueuePageHref,
  clearQueue,
  findQueuePageIndex,
  getAdjacentQueuePageFromQueue,
  getItemsForPage,
  isQueueComplete,
  loadQueue,
  markRated,
  recoverQueueState,
  saveQueue,
  saveQueueState,
} from "./domain/sessionQueue";
export type {
  HifzBlock,
  HifzFlowType,
  HifzQueueItem,
  HifzQueuePagePointer,
  HifzSessionQueue,
} from "./domain/sessionQueue";
export type { HifzExerciseFlow } from "./domain/types";
