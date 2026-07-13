import assert from "node:assert/strict";
import test from "node:test";
import {
  UNDERSTANDING_COVERAGE_EVIDENCE,
  UNDERSTANDING_COVERAGE_TIERS,
  createUnderstandingCoverageService,
  loadPaginatedWordFrequencies,
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
    evidence: UNDERSTANDING_COVERAGE_EVIDENCE,
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
    evidence: UNDERSTANDING_COVERAGE_EVIDENCE,
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
    evidence: UNDERSTANDING_COVERAGE_EVIDENCE,
    masteredFrequency: 1,
    masteredWordCount: 1,
    tierFrequency: 10,
    wordCount: 10,
    wordLimit: 10,
  });
  assert.deepEqual(tiers.at(-1), {
    coveragePercentage: 100,
    evidence: UNDERSTANDING_COVERAGE_EVIDENCE,
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
    evidence: UNDERSTANDING_COVERAGE_EVIDENCE,
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

test("returns coverage and tiers from exactly one mastery lookup", async () => {
  let globalWordLoads = 0;
  let masteredWordLoads = 0;
  const service = createUnderstandingCoverageService({
    loadGlobalWords: async () => {
      globalWordLoads += 1;
      return [
        { frequency: 80, id: 1 },
        { frequency: 20, id: 2 },
      ];
    },
    loadMasteredWordIds: async () => {
      masteredWordLoads += 1;
      return [2];
    },
  });

  const snapshot = await service.getUnderstandingSnapshot("user-1");

  assert.deepEqual(snapshot.coverage, {
    denominator: 100,
    evidence: UNDERSTANDING_COVERAGE_EVIDENCE,
    masteredFrequency: 20,
    masteredWordCount: 1,
    percentage: 20,
  });
  assert.equal(snapshot.tiers.length, UNDERSTANDING_COVERAGE_TIERS.length);
  assert.deepEqual(snapshot.tiers[0], {
    coveragePercentage: 100,
    evidence: UNDERSTANDING_COVERAGE_EVIDENCE,
    masteredFrequency: 20,
    masteredWordCount: 1,
    tierFrequency: 100,
    wordCount: 2,
    wordLimit: 10,
  });
  assert.equal(globalWordLoads, 1);
  assert.equal(masteredWordLoads, 1);
});

test("coalesces concurrent global snapshot loads", async () => {
  let globalWordLoads = 0;
  let releaseGlobalWords: (
    rows: readonly { frequency: number; id: number }[],
  ) => void = () => undefined;
  const pendingGlobalWords = new Promise<
    readonly { frequency: number; id: number }[]
  >((resolve) => {
    releaseGlobalWords = resolve;
  });
  const service = createUnderstandingCoverageService({
    loadGlobalWords: async () => {
      globalWordLoads += 1;
      return pendingGlobalWords;
    },
    loadMasteredWordIds: async () => [1],
  });

  const coverage = service.getUnderstandingCoverage("user-1");
  const tiers = service.getCoverageTiers("user-2");
  await Promise.resolve();

  assert.equal(globalWordLoads, 1);
  releaseGlobalWords([{ frequency: 10, id: 1 }]);
  await Promise.all([coverage, tiers]);
  assert.equal(globalWordLoads, 1);
});

test("retries the global snapshot after a failed load", async () => {
  let globalWordLoads = 0;
  const service = createUnderstandingCoverageService({
    loadGlobalWords: async () => {
      globalWordLoads += 1;
      if (globalWordLoads === 1) throw new Error("temporary failure");
      return [{ frequency: 10, id: 1 }];
    },
    loadMasteredWordIds: async () => [1],
  });

  await assert.rejects(
    service.getUnderstandingCoverage("user-1"),
    /temporary failure/,
  );
  assert.equal(
    (await service.getUnderstandingCoverage("user-1")).percentage,
    100,
  );
  assert.equal(globalWordLoads, 2);
});

test("filters invalid global rows and deduplicates global and mastered ids", async () => {
  const service = createUnderstandingCoverageService({
    loadGlobalWords: async () => [
      { frequency: 50, id: 1 },
      { frequency: 10, id: 0 },
      { frequency: -1, id: 2 },
      { frequency: Number.NaN, id: 3 },
      { frequency: 60, id: 1 },
    ],
    loadMasteredWordIds: async () => [1, 1, 0, 3, 999],
  });

  assert.deepEqual(await service.getUnderstandingCoverage("user-1"), {
    denominator: 60,
    evidence: UNDERSTANDING_COVERAGE_EVIDENCE,
    masteredFrequency: 60,
    masteredWordCount: 1,
    percentage: 100,
  });
});

test("uses word id as the deterministic tier tie-breaker", async () => {
  const service = createUnderstandingCoverageService({
    loadGlobalWords: async () =>
      Array.from({ length: 12 }, (_, index) => ({
        frequency: 1,
        id: 12 - index,
      })),
    loadMasteredWordIds: async () => [10, 11],
  });

  const topTen = (await service.getCoverageTiers("user-1"))[0];

  assert.equal(topTen.wordCount, 10);
  assert.equal(topTen.masteredWordCount, 1);
  assert.equal(topTen.masteredFrequency, 1);
});

test("returns zero percentages for a zero-frequency denominator", async () => {
  const service = createUnderstandingCoverageService({
    loadGlobalWords: async () => [
      { frequency: 0, id: 1 },
      { frequency: 0, id: 2 },
    ],
    loadMasteredWordIds: async () => [1],
  });

  const snapshot = await service.getUnderstandingSnapshot("user-1");

  assert.equal(snapshot.coverage.denominator, 0);
  assert.equal(snapshot.coverage.masteredWordCount, 1);
  assert.equal(snapshot.coverage.percentage, 0);
  assert.ok(snapshot.tiers.every((tier) => tier.coveragePercentage === 0));
});

test("paginates exact 999, 1000, and 1001 row boundaries", async () => {
  async function loadCount(rowCount: number) {
    const rows = Array.from({ length: rowCount }, (_, index) => ({
      frequency: rowCount - index,
      id: index + 1,
    }));
    const ranges: Array<[number, number]> = [];
    const loaded = await loadPaginatedWordFrequencies(
      async (offset, endInclusive) => {
        ranges.push([offset, endInclusive]);
        return rows.slice(offset, endInclusive + 1);
      },
    );
    return { loaded, ranges };
  }

  const belowBoundary = await loadCount(999);
  const exactBoundary = await loadCount(1000);
  const aboveBoundary = await loadCount(1001);

  assert.equal(belowBoundary.loaded.length, 999);
  assert.deepEqual(belowBoundary.ranges, [[0, 999]]);
  assert.equal(exactBoundary.loaded.length, 1000);
  assert.deepEqual(exactBoundary.ranges, [
    [0, 999],
    [1000, 1999],
  ]);
  assert.equal(aboveBoundary.loaded.length, 1001);
  assert.deepEqual(aboveBoundary.ranges, [
    [0, 999],
    [1000, 1999],
  ]);
});
