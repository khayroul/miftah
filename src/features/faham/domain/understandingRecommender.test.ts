import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateCoverageDeltaPercentage,
  getNextBestWords,
  UNDERSTANDING_RECOMMENDATION_EVIDENCE,
  type UnderstandingWordCandidate,
} from "./understandingRecommender";

const candidates: UnderstandingWordCandidate[] = [
  {
    frequency: 100,
    lexicalKind: "particle",
    wordId: 1,
  },
  {
    contextRelevance: 1,
    frequency: 80,
    lexicalKind: "content",
    readiness: 1,
    wordId: 2,
  },
  {
    frequency: 80,
    isGrammarKey: true,
    lexicalKind: "particle",
    wordId: 3,
  },
];

test("guided mode blends leverage with meaningful, contextual vocabulary", () => {
  const result = getNextBestWords({ candidates, denominator: 1000, limit: 3 });

  assert.deepEqual(result.map((word) => word.wordId), [2, 3, 1]);
  assert.equal(result[0].mode, "guided");
  assert.equal(result[0].evidence, UNDERSTANDING_RECOMMENDATION_EVIDENCE);
  assert.equal(
    result[0].evidence.claimStatus,
    "not_a_verified_public_understanding_claim",
  );
  assert.deepEqual(result[0].scoreBreakdown, {
    context: { normalized: 1, weighted: 0.15, weight: 0.15 },
    grammarKey: { normalized: 0, weighted: 0, weight: 0.1 },
    learnability: { normalized: 1, weighted: 0.25, weight: 0.25 },
    leverage: { normalized: 0.8, weighted: 0.36000000000000004, weight: 0.45 },
    readiness: { normalized: 1, weighted: 0.05, weight: 0.05 },
  });
});

test("fastest mode ranks by coverage leverage alone", () => {
  const result = getNextBestWords({
    candidates,
    denominator: 1000,
    limit: 3,
    mode: "fastest",
  });

  assert.deepEqual(result.map((word) => word.wordId), [1, 2, 3]);
  assert.equal(result[0].score, 100);
  assert.equal(result[0].scoreBreakdown.learnability.weighted, 0);
  assert.equal(result[0].scoreBreakdown.context.weighted, 0);
  assert.equal(result[0].scoreBreakdown.grammarKey.weighted, 0);
});

test("grammar keys recover useful particles without making every particle dominant", () => {
  const result = getNextBestWords({ candidates, denominator: 1000, limit: 3 });

  const grammarKey = result.find((word) => word.wordId === 3);
  const plainParticle = result.find((word) => word.wordId === 1);

  assert.ok(grammarKey);
  assert.ok(plainParticle);
  assert.equal(grammarKey.scoreBreakdown.grammarKey.weighted, 0.1);
  assert.ok(grammarKey.score > plainParticle.score);
});

test("ordering is deterministic for exact ties and does not mutate candidates", () => {
  const tied: UnderstandingWordCandidate[] = [
    { frequency: 50, lexicalKind: "content", wordId: 9 },
    { frequency: 50, lexicalKind: "content", wordId: 2 },
  ];
  const before = structuredClone(tied);

  const first = getNextBestWords({
    candidates: tied,
    denominator: 100,
    limit: 2,
  });
  const second = getNextBestWords({
    candidates: tied,
    denominator: 100,
    limit: 2,
  });

  assert.deepEqual(first, second);
  assert.deepEqual(first.map((word) => word.wordId), [2, 9]);
  assert.deepEqual(tied, before);
});

test("returns each word only once when upstream candidates contain duplicates", () => {
  const result = getNextBestWords({
    candidates: [
      { frequency: 50, lexicalKind: "content", wordId: 1 },
      {
        contextRelevance: 1,
        frequency: 50,
        lexicalKind: "content",
        wordId: 1,
      },
      { frequency: 40, lexicalKind: "content", wordId: 2 },
    ],
    denominator: 100,
    limit: 3,
  });

  assert.deepEqual(result.map((word) => word.wordId), [1, 2]);
  assert.equal(result[0].scoreBreakdown.context.normalized, 1);
});

test("filters mastered and malformed candidates and respects the requested limit", () => {
  const result = getNextBestWords({
    candidates: [
      { frequency: 100, isMastered: true, lexicalKind: "content", wordId: 1 },
      { frequency: 90, lexicalKind: "content", wordId: -1 },
      { frequency: 0, lexicalKind: "content", wordId: 2 },
      { frequency: 80, lexicalKind: "content", wordId: 3 },
      { frequency: 70, lexicalKind: "content", wordId: 4 },
    ],
    denominator: 1000,
    limit: 1,
  });

  assert.deepEqual(result.map((word) => word.wordId), [3]);
  assert.deepEqual(
    getNextBestWords({ candidates, denominator: 1000, limit: 0 }),
    [],
  );
});

test("clamps contextual and readiness inputs to a stable zero-to-one range", () => {
  const [result] = getNextBestWords({
    candidates: [{
      contextRelevance: 4,
      frequency: 10,
      lexicalKind: "unknown",
      readiness: -2,
      wordId: 1,
    }],
    denominator: 100,
    limit: 1,
  });

  assert.equal(result.scoreBreakdown.context.normalized, 1);
  assert.equal(result.scoreBreakdown.readiness.normalized, 0);
});

test("coverage delta math reports absolute weighted gain and fails closed", () => {
  assert.equal(calculateCoverageDeltaPercentage(250, 1000), 25);
  assert.ok(
    Math.abs(calculateCoverageDeltaPercentage(1, 3) - (100 / 3)) <
      1e-12,
  );
  assert.equal(calculateCoverageDeltaPercentage(0, 1000), 0);
  assert.equal(calculateCoverageDeltaPercentage(10, 0), 0);
  assert.equal(calculateCoverageDeltaPercentage(Number.NaN, 1000), 0);
});
