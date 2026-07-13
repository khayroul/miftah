export const UNDERSTANDING_PATH_MODES = ["guided", "fastest"] as const;

export type UnderstandingPathMode = (typeof UNDERSTANDING_PATH_MODES)[number];
export type UnderstandingLexicalKind = "content" | "particle" | "unknown";

export const UNDERSTANDING_RECOMMENDATION_EVIDENCE = Object.freeze({
  claimStatus: "not_a_verified_public_understanding_claim",
  coverageBasis: "caller_supplied_frequency_denominator",
  masteryBasis: "caller_supplied_recall_status",
} as const);

export type UnderstandingRecommendationEvidence =
  typeof UNDERSTANDING_RECOMMENDATION_EVIDENCE;

export interface UnderstandingWordCandidate {
  contextRelevance?: number;
  frequency: number;
  isGrammarKey?: boolean;
  isMastered?: boolean;
  lexicalKind: UnderstandingLexicalKind;
  readiness?: number;
  wordId: number;
}

export interface UnderstandingScoreBreakdown {
  context: UnderstandingScoreFactor;
  grammarKey: UnderstandingScoreFactor;
  learnability: UnderstandingScoreFactor;
  leverage: UnderstandingScoreFactor;
  readiness: UnderstandingScoreFactor;
}

export interface UnderstandingScoreFactor {
  normalized: number;
  weighted: number;
  weight: number;
}

export interface RecommendedUnderstandingWord {
  coverageDeltaPercentage: number;
  evidence: UnderstandingRecommendationEvidence;
  frequency: number;
  mode: UnderstandingPathMode;
  score: number;
  scoreBreakdown: UnderstandingScoreBreakdown;
  wordId: number;
}

export interface GetNextBestWordsInput {
  candidates: readonly UnderstandingWordCandidate[];
  denominator: number;
  limit: number;
  mode?: UnderstandingPathMode;
}

interface ScoreWeights {
  context: number;
  grammarKey: number;
  learnability: number;
  leverage: number;
  readiness: number;
}

const SCORE_WEIGHTS: Record<UnderstandingPathMode, ScoreWeights> = {
  guided: {
    context: 0.15,
    grammarKey: 0.10,
    learnability: 0.25,
    leverage: 0.45,
    readiness: 0.05,
  },
  fastest: {
    context: 0,
    grammarKey: 0,
    learnability: 0,
    leverage: 1,
    readiness: 0,
  },
};

const LEARNABILITY_BY_KIND: Record<UnderstandingLexicalKind, number> = {
  content: 1,
  particle: 0.25,
  unknown: 0.6,
};

function clampUnitInterval(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.min(1, Math.max(0, value));
}

function normalizePathMode(value: unknown): UnderstandingPathMode {
  return value === "fastest" ? "fastest" : "guided";
}

function normalizeLexicalKind(value: unknown): UnderstandingLexicalKind {
  if (value === "content" || value === "particle") return value;
  return "unknown";
}

function isEligibleCandidate(candidate: UnderstandingWordCandidate): boolean {
  return (
    !candidate.isMastered &&
    Number.isInteger(candidate.wordId) &&
    candidate.wordId > 0 &&
    Number.isFinite(candidate.frequency) &&
    candidate.frequency > 0
  );
}

function makeFactor(normalized: number, weight: number): UnderstandingScoreFactor {
  return {
    normalized,
    weighted: normalized * weight,
    weight,
  };
}

function buildScoreBreakdown(
  candidate: UnderstandingWordCandidate,
  maxFrequency: number,
  weights: ScoreWeights,
): UnderstandingScoreBreakdown {
  return {
    context: makeFactor(
      clampUnitInterval(candidate.contextRelevance, 0),
      weights.context,
    ),
    grammarKey: makeFactor(candidate.isGrammarKey ? 1 : 0, weights.grammarKey),
    learnability: makeFactor(
      LEARNABILITY_BY_KIND[normalizeLexicalKind(candidate.lexicalKind)],
      weights.learnability,
    ),
    leverage: makeFactor(candidate.frequency / maxFrequency, weights.leverage),
    readiness: makeFactor(
      // Missing FSRS evidence must not make a word look fully ready: failing
      // closed avoids overloading the learner until an adapter supplies it.
      clampUnitInterval(candidate.readiness, 0),
      weights.readiness,
    ),
  };
}

function totalScore(breakdown: UnderstandingScoreBreakdown): number {
  return Object.values(breakdown).reduce(
    (total, factor) => total + factor.weighted,
    0,
  ) * 100;
}

function deduplicateRankedWords(
  recommendations: readonly RecommendedUnderstandingWord[],
): RecommendedUnderstandingWord[] {
  const seenWordIds = new Set<number>();

  return recommendations.filter((recommendation) => {
    if (seenWordIds.has(recommendation.wordId)) return false;
    seenWordIds.add(recommendation.wordId);
    return true;
  });
}

export function calculateCoverageDeltaPercentage(
  frequency: number,
  denominator: number,
): number {
  if (
    !Number.isFinite(frequency) ||
    frequency <= 0 ||
    !Number.isFinite(denominator) ||
    denominator <= 0
  ) {
    return 0;
  }

  return (frequency / denominator) * 100;
}

/**
 * Ranks unmastered vocabulary without mutating the supplied candidate list.
 * `guided` blends coverage leverage with felt meaning, current context,
 * curated grammar keys and FSRS readiness. `fastest` is deliberately pure
 * frequency leverage, matching the power-user route in the product spec.
 */
export function getNextBestWords({
  candidates,
  denominator,
  limit,
  mode: requestedMode = "guided",
}: GetNextBestWordsInput): RecommendedUnderstandingWord[] {
  if (!Number.isInteger(limit) || limit <= 0) return [];

  const eligibleCandidates = candidates.filter(isEligibleCandidate);
  if (eligibleCandidates.length === 0) return [];

  const maxFrequency = Math.max(
    ...eligibleCandidates.map((candidate) => candidate.frequency),
  );
  const mode = normalizePathMode(requestedMode);
  const weights = SCORE_WEIGHTS[mode];

  const rankedWords = eligibleCandidates
    .map((candidate): RecommendedUnderstandingWord => {
      const scoreBreakdown = buildScoreBreakdown(
        candidate,
        maxFrequency,
        weights,
      );

      return {
        coverageDeltaPercentage: calculateCoverageDeltaPercentage(
          candidate.frequency,
          denominator,
        ),
        evidence: UNDERSTANDING_RECOMMENDATION_EVIDENCE,
        frequency: candidate.frequency,
        mode,
        score: totalScore(scoreBreakdown),
        scoreBreakdown,
        wordId: candidate.wordId,
      };
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.coverageDeltaPercentage - left.coverageDeltaPercentage ||
        left.wordId - right.wordId,
    );

  return deduplicateRankedWords(rankedWords).slice(0, limit);
}
