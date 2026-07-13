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

  return {
    async getUnderstandingCoverage(userId: string): Promise<UnderstandingCoverage> {
      const [snapshot, masteredWordIds] = await Promise.all([
        getSnapshot(),
        dataSource.loadMasteredWordIds(userId),
      ]);
      const masteredIds = uniqueKnownMasteredWordIds(masteredWordIds, snapshot.wordFrequencyById);
      const masteredFrequency = Array.from(masteredIds).reduce(
        (total, wordId) => total + (snapshot.wordFrequencyById.get(wordId) ?? 0),
        0,
      );

      return {
        denominator: snapshot.denominator,
        evidence: UNDERSTANDING_COVERAGE_EVIDENCE,
        masteredFrequency,
        masteredWordCount: masteredIds.size,
        percentage: percentage(masteredFrequency, snapshot.denominator),
      };
    },

    async getCoverageTiers(userId: string): Promise<UnderstandingCoverageTier[]> {
      const [snapshot, masteredWordIds] = await Promise.all([
        getSnapshot(),
        dataSource.loadMasteredWordIds(userId),
      ]);
      const masteredIds = uniqueKnownMasteredWordIds(masteredWordIds, snapshot.wordFrequencyById);

      return snapshot.tiers.map((tier) => {
        const masteredFrequency = Array.from(tier.wordIds).reduce(
          (total, wordId) => total + (masteredIds.has(wordId) ? snapshot.wordFrequencyById.get(wordId) ?? 0 : 0),
          0,
        );
        const masteredWordCount = Array.from(tier.wordIds).filter((wordId) => masteredIds.has(wordId)).length;

        return {
          coveragePercentage: tier.coveragePercentage,
          evidence: UNDERSTANDING_COVERAGE_EVIDENCE,
          masteredFrequency,
          masteredWordCount,
          tierFrequency: tier.tierFrequency,
          wordCount: tier.wordCount,
          wordLimit: tier.wordLimit,
        };
      });
    },
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

const productionDataSource: UnderstandingCoverageDataSource = {
  async loadGlobalWords(): Promise<readonly WordFrequencyRow[]> {
    const words: WordFrequencyRow[] = [];

    for (let offset = 0; ; offset += GLOBAL_WORD_PAGE_SIZE) {
      const { data, error } = await supabaseServer
        .from("words")
        .select("id, frequency")
        .order("frequency", { ascending: false })
        .order("id", { ascending: true })
        .range(offset, offset + GLOBAL_WORD_PAGE_SIZE - 1);
      if (error) throw error;

      const rawPage = data ?? [];
      const page = rawPage.filter(isWordFrequencyRow);
      words.push(...page);
      if (rawPage.length < GLOBAL_WORD_PAGE_SIZE) return words;
    }
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
