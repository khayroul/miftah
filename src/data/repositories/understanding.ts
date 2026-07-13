import { supabaseServer } from "@/data/supabase/server";

export const UNDERSTANDING_COVERAGE_TIERS = [10, 100, 300, 500, 1000, 2000, 5000] as const;

/**
 * This metric is not approved as a public Quran-understanding claim yet.
 * The denominator and mastery criterion require the data-owner sign-offs in
 * docs/coverage-data-quality-verdict-2026-07-13.md.
 */
export const UNDERSTANDING_COVERAGE_EVIDENCE = Object.freeze({
  claimStatus: "internal_only_unverified",
  denominatorStatus: "unreconciled_word_frequency",
  displayLabel: "Frequency-weighted recognised vocabulary",
  masteryStatus: "implementation_recall_flag",
} as const);

export type UnderstandingCoverageEvidence = typeof UNDERSTANDING_COVERAGE_EVIDENCE;

export interface UnderstandingCoverage {
  denominator: number;
  evidence: UnderstandingCoverageEvidence;
  masteredFrequency: number;
  masteredWordCount: number;
  percentage: number;
}

export interface UnderstandingCoverageTier {
  coveragePercentage: number;
  evidence: UnderstandingCoverageEvidence;
  masteredFrequency: number;
  masteredWordCount: number;
  tierFrequency: number;
  wordCount: number;
  wordLimit: (typeof UNDERSTANDING_COVERAGE_TIERS)[number];
}

export interface UnderstandingSnapshot {
  coverage: UnderstandingCoverage;
  tiers: UnderstandingCoverageTier[];
}

interface WordFrequencyRow {
  frequency: number;
  id: number;
}

const GLOBAL_WORD_PAGE_SIZE = 1000;

interface GlobalCoverageSnapshot {
  denominator: number;
  tiers: readonly GlobalTierBoundary[];
  wordFrequencyById: ReadonlyMap<number, number>;
}

interface GlobalTierBoundary {
  coveragePercentage: number;
  tierFrequency: number;
  wordIds: ReadonlySet<number>;
  wordCount: number;
  wordLimit: (typeof UNDERSTANDING_COVERAGE_TIERS)[number];
}

export interface UnderstandingCoverageDataSource {
  loadGlobalWords(): Promise<readonly WordFrequencyRow[]>;
  loadMasteredWordIds(userId: string): Promise<readonly number[]>;
}

export interface UnderstandingCoverageService {
  getCoverageTiers(userId: string): Promise<UnderstandingCoverageTier[]>;
  getUnderstandingSnapshot(userId: string): Promise<UnderstandingSnapshot>;
  getUnderstandingCoverage(userId: string): Promise<UnderstandingCoverage>;
}

function percentage(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : (numerator / denominator) * 100;
}

function buildGlobalCoverageSnapshot(words: readonly WordFrequencyRow[]): GlobalCoverageSnapshot {
  const wordFrequencyById = new Map<number, number>();

  for (const word of words) {
    if (!Number.isInteger(word.id) || word.id <= 0 || !Number.isFinite(word.frequency) || word.frequency < 0) {
      continue;
    }
    wordFrequencyById.set(word.id, word.frequency);
  }

  const rankedWords = Array.from(wordFrequencyById, ([id, frequency]) => ({ frequency, id }))
    .sort((left, right) => right.frequency - left.frequency || left.id - right.id);
  const denominator = rankedWords.reduce((total, word) => total + word.frequency, 0);
  const tiers = UNDERSTANDING_COVERAGE_TIERS.map((wordLimit) => {
    const tierWords = rankedWords.slice(0, wordLimit);
    const currentTierFrequency = tierWords.reduce((total, word) => total + word.frequency, 0);

    return {
      coveragePercentage: percentage(currentTierFrequency, denominator),
      tierFrequency: currentTierFrequency,
      wordIds: new Set(tierWords.map((word) => word.id)),
      wordCount: tierWords.length,
      wordLimit,
    };
  });

  return { denominator, tiers, wordFrequencyById };
}

function uniqueKnownMasteredWordIds(
  wordIds: readonly number[],
  wordFrequencyById: ReadonlyMap<number, number>,
): Set<number> {
  return new Set(
    wordIds.filter((wordId) => Number.isInteger(wordId) && wordFrequencyById.has(wordId)),
  );
}

function buildUnderstandingSnapshot(
  snapshot: GlobalCoverageSnapshot,
  masteredWordIds: readonly number[],
): UnderstandingSnapshot {
  const masteredIds = uniqueKnownMasteredWordIds(
    masteredWordIds,
    snapshot.wordFrequencyById,
  );
  const masteredFrequency = Array.from(masteredIds).reduce(
    (total, wordId) =>
      total + (snapshot.wordFrequencyById.get(wordId) ?? 0),
    0,
  );
  const coverage = {
    denominator: snapshot.denominator,
    evidence: UNDERSTANDING_COVERAGE_EVIDENCE,
    masteredFrequency,
    masteredWordCount: masteredIds.size,
    percentage: percentage(masteredFrequency, snapshot.denominator),
  };
  const tiers = snapshot.tiers.map((tier) => {
    const masteredTierWordIds = Array.from(tier.wordIds).filter((wordId) =>
      masteredIds.has(wordId),
    );
    const masteredTierFrequency = masteredTierWordIds.reduce(
      (total, wordId) =>
        total + (snapshot.wordFrequencyById.get(wordId) ?? 0),
      0,
    );

    return {
      coveragePercentage: tier.coveragePercentage,
      evidence: UNDERSTANDING_COVERAGE_EVIDENCE,
      masteredFrequency: masteredTierFrequency,
      masteredWordCount: masteredTierWordIds.length,
      tierFrequency: tier.tierFrequency,
      wordCount: tier.wordCount,
      wordLimit: tier.wordLimit,
    };
  });

  return { coverage, tiers };
}

export function createUnderstandingCoverageService(
  dataSource: UnderstandingCoverageDataSource,
): UnderstandingCoverageService {
  let snapshotPromise: Promise<GlobalCoverageSnapshot> | null = null;

  async function getSnapshot(): Promise<GlobalCoverageSnapshot> {
    if (!snapshotPromise) {
      snapshotPromise = dataSource.loadGlobalWords().then(buildGlobalCoverageSnapshot);
      snapshotPromise.catch(() => {
        snapshotPromise = null;
      });
    }
    return snapshotPromise;
  }

  async function getUnderstandingSnapshot(
    userId: string,
  ): Promise<UnderstandingSnapshot> {
    const [snapshot, masteredWordIds] = await Promise.all([
      getSnapshot(),
      dataSource.loadMasteredWordIds(userId),
    ]);
    return buildUnderstandingSnapshot(snapshot, masteredWordIds);
  }

  return {
    async getUnderstandingCoverage(userId: string): Promise<UnderstandingCoverage> {
      return (await getUnderstandingSnapshot(userId)).coverage;
    },

    async getCoverageTiers(userId: string): Promise<UnderstandingCoverageTier[]> {
      return (await getUnderstandingSnapshot(userId)).tiers;
    },

    getUnderstandingSnapshot,
  };
}

function isWordFrequencyRow(value: unknown): value is WordFrequencyRow {
  if (!value || typeof value !== "object") return false;
  return (
    typeof Reflect.get(value, "id") === "number" &&
    typeof Reflect.get(value, "frequency") === "number"
  );
}

function isWordId(value: unknown): value is number {
  return typeof value === "number";
}

export async function loadPaginatedWordFrequencies(
  loadPage: (
    offset: number,
    endInclusive: number,
  ) => Promise<readonly unknown[]>,
  pageSize = GLOBAL_WORD_PAGE_SIZE,
): Promise<readonly WordFrequencyRow[]> {
  if (!Number.isInteger(pageSize) || pageSize <= 0) {
    throw new Error("Understanding word page size must be a positive integer");
  }

  const words: WordFrequencyRow[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const rawPage = await loadPage(offset, offset + pageSize - 1);
    words.push(...rawPage.filter(isWordFrequencyRow));
    if (rawPage.length < pageSize) return words;
  }
}

const productionDataSource: UnderstandingCoverageDataSource = {
  async loadGlobalWords(): Promise<readonly WordFrequencyRow[]> {
    return loadPaginatedWordFrequencies(async (offset, endInclusive) => {
      const { data, error } = await supabaseServer
        .from("words")
        .select("id, frequency")
        .order("frequency", { ascending: false })
        .order("id", { ascending: true })
        .range(offset, endInclusive);
      if (error) throw error;

      return data ?? [];
    });
  },

  async loadMasteredWordIds(userId: string): Promise<readonly number[]> {
    const { data, error } = await supabaseServer
      .from("vocab_progress")
      .select("word_id")
      .eq("user_id", userId)
      .eq("is_mastered", true);
    if (error) throw error;
    return (data ?? []).map((row) => row.word_id).filter(isWordId);
  },
};

const productionService = createUnderstandingCoverageService(productionDataSource);

export const getUnderstandingCoverage = productionService.getUnderstandingCoverage;
export const getCoverageTiers = productionService.getCoverageTiers;
export const getUnderstandingSnapshot = productionService.getUnderstandingSnapshot;
