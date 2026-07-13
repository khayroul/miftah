export {
  calculateCoverageDeltaPercentage,
  getCoverageTiers,
  getNextBestWords,
  getUnderstandingCoverage,
  UNDERSTANDING_COVERAGE_EVIDENCE,
  UNDERSTANDING_COVERAGE_TIERS,
  UNDERSTANDING_PATH_MODES,
  UNDERSTANDING_RECOMMENDATION_EVIDENCE,
} from "./understanding";
export type {
  GetNextBestWordsInput,
  RecommendedUnderstandingWord,
  UnderstandingCoverage,
  UnderstandingCoverageEvidence,
  UnderstandingCoverageTier,
  UnderstandingLexicalKind,
  UnderstandingPathMode,
  UnderstandingRecommendationEvidence,
  UnderstandingScoreBreakdown,
  UnderstandingScoreFactor,
  UnderstandingWordCandidate,
} from "./understanding";
export {
  FAHAM_LEVEL_WORD_LIMITS,
  TOP_FAHAM_WORD_LIMIT,
} from "./domain/config";
export {
  buildFahamQueuePlan,
  DEFAULT_FAHAM_ENGINE_CONFIG,
} from "./domain/engine";
export { buildFahamLevelProgress } from "./domain/levels";
export type { FahamLevelProgress } from "./domain/levels";
export {
  isRecentlyReviewed,
  isUniqueViolation,
} from "./domain/idempotency";
export { parseFahamSourcePreset } from "./domain/presets";
export type { FahamSourcePreset } from "./domain/presets";
export {
  fahamExposureSchema,
  fahamQueueRequestSchema,
  fahamRateRequestSchema,
} from "./domain/schemas";
export { buildFahamQueueSnapshot } from "./domain/queue";
export type { FahamQueueSnapshot } from "./domain/queue";
