import assert from "node:assert/strict";
import test from "node:test";
import {
  UNDERSTANDING_COVERAGE_TIERS,
  createUnderstandingCoverageService,
} from "./understanding";

test("returns zero coverage when a user has not mastered any words", async () => {
  const service = createUnderstandingCoverageService({
    loadGlobalWords: async () => [
      { frequency: 10, id: 1 },
      { frequency: 5, id: 2 },
    ],
    loadMasteredWordIds: async () => [],
  });

  assert.deepEqual(await service.getUnderstandingCoverage("user-1"), {
    denominator: 15,
    masteredFrequency: 0,
    masteredWordCount: 0,
    percentage: 0,
  });
});

test("weights coverage by a mastered word's Quran frequency", async () => {
  const service = createUnderstandingCoverageService({
    loadGlobalWords: async () => [
      { frequency: 80, id: 1 },
      { frequency: 15, id: 2 },
      { frequency: 5, id: 3 },
    ],
    loadMasteredWordIds: async () => [2, 3],
  });

  assert.deepEqual(await service.getUnderstandingCoverage("user-1"), {
    denominator: 100,
    masteredFrequency: 20,
    masteredWordCount: 2,
    percentage: 20,
  });
});

test("returns all requested tier boundaries, including tiers larger than the vocabulary", async () => {
  const service = createUnderstandingCoverageService({
    loadGlobalWords: async () => Array.from(
      { length: 12 },
      (_, index) => ({ frequency: 1, id: index + 1 }),
    ),
    loadMasteredWordIds: async () => [1, 12],
  });

  const tiers = await service.getCoverageTiers("user-1");

  assert.deepEqual(
    tiers.map((tier) => tier.wordLimit),
    UNDERSTANDING_COVERAGE_TIERS,
  );
  assert.deepEqual(tiers[0], {
    coveragePercentage: (10 / 12) * 100,
    masteredFrequency: 1,
    masteredWordCount: 1,
    tierFrequency: 10,
    wordCount: 10,
    wordLimit: 10,
  });
  assert.deepEqual(tiers.at(-1), {
    coveragePercentage: 100,
    masteredFrequency: 2,
    masteredWordCount: 2,
    tierFrequency: 12,
    wordCount: 12,
    wordLimit: 5000,
  });
});

test("deduplicates mastered ids and ignores ids outside the canonical word list", async () => {
  const service = createUnderstandingCoverageService({
    loadGlobalWords: async () => [
      { frequency: 60, id: 1 },
      { frequency: 40, id: 2 },
    ],
    loadMasteredWordIds: async () => [1, 1, 999],
  });

  assert.deepEqual(await service.getUnderstandingCoverage("user-1"), {
    denominator: 100,
    masteredFrequency: 60,
    masteredWordCount: 1,
    percentage: 60,
  });
});

test("caches global boundaries while each user metric uses one mastery lookup", async () => {
  let globalWordLoads = 0;
  let masteredWordLoads = 0;
  const service = createUnderstandingCoverageService({
    loadGlobalWords: async () => {
      globalWordLoads += 1;
      return [{ frequency: 100, id: 1 }];
    },
    loadMasteredWordIds: async () => {
      masteredWordLoads += 1;
      return [1];
    },
  });

  await service.getUnderstandingCoverage("user-1");
  await service.getCoverageTiers("user-1");

  assert.equal(globalWordLoads, 1);
  assert.equal(masteredWordLoads, 2);
});
