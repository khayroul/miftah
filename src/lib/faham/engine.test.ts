import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFahamQueuePlan,
  DEFAULT_FAHAM_ENGINE_CONFIG,
  isEligibleForNewCard,
  normalizeFahamEngineConfig,
  scoreFahamCandidate,
} from "./engine";
import type { FahamCandidateWord, FahamDueCard } from "./types";
import type { VocabExposureSummary, VocabProgress, Word } from "@/types/database";

function buildWord(overrides: Partial<Word> = {}): Word {
  return {
    id: 1,
    text_uthmani: "الْكِتَاب",
    text_simple: "الكتاب",
    translation_bm: "kitab",
    translation_en: "book",
    transliteration: "al-kitab",
    root: "كتب",
    lemma: "كتاب",
    pos: "word",
    frequency: 120,
    ...overrides,
  };
}

function buildSummary(
  overrides: Partial<VocabExposureSummary> = {},
): VocabExposureSummary {
  return {
    user_id: "user-1",
    word_id: 1,
    exposure_event_count: 3,
    distinct_context_count: 2,
    distinct_source_count: 1,
    total_occurrence_weight: 5,
    reading_event_count: 2,
    theme_event_count: 0,
    hifz_event_count: 0,
    reading_occurrence_weight: 5,
    theme_occurrence_weight: 0,
    hifz_occurrence_weight: 0,
    last_exposed_at: "2026-03-11T10:00:00.000Z",
    ...overrides,
  };
}

function buildCandidate(
  overrides: {
    summary?: Partial<VocabExposureSummary>;
    word?: Partial<Word>;
  } = {},
): FahamCandidateWord {
  return {
    summary: buildSummary(overrides.summary),
    word: buildWord(overrides.word),
  };
}

function buildDueCard(id: number): FahamDueCard {
  const progress: VocabProgress = {
    id,
    user_id: "user-1",
    word_id: id,
    stability: 0,
    difficulty: 0,
    elapsed_days: 0,
    scheduled_days: 0,
    reps: 0,
    lapses: 0,
    state: 0,
    due: "2026-03-11T10:00:00.000Z",
    last_review: null,
    created_at: "2026-03-11T10:00:00.000Z",
    updated_at: "2026-03-11T10:00:00.000Z",
  };

  return {
    progress,
    word: buildWord({ id }),
  };
}

test("candidate becomes eligible after enough repeated exposure", () => {
  const config = normalizeFahamEngineConfig({});
  const candidate = buildCandidate({
    summary: {
      distinct_context_count: 1,
      exposure_event_count: 3,
      total_occurrence_weight: 4,
    },
  });

  assert.equal(isEligibleForNewCard(candidate, config), true);
});

test("candidate stays locked when exposure is still too shallow", () => {
  const config = normalizeFahamEngineConfig({});
  const candidate = buildCandidate({
    summary: {
      distinct_context_count: 1,
      exposure_event_count: 1,
      total_occurrence_weight: 2,
    },
  });

  assert.equal(isEligibleForNewCard(candidate, config), false);
});

test("preferred sources change candidate ordering", () => {
  const readingFirstConfig = normalizeFahamEngineConfig({
    preferredSources: ["reading_page", "theme_chunk", "hifz_ayah"],
  });
  const themeFirstConfig = normalizeFahamEngineConfig({
    preferredSources: ["theme_chunk", "reading_page", "hifz_ayah"],
  });

  const readingCandidate = buildCandidate({
    summary: {
      reading_occurrence_weight: 4,
      theme_occurrence_weight: 0,
      total_occurrence_weight: 4,
    },
  });
  const themeCandidate = buildCandidate({
    summary: {
      reading_occurrence_weight: 0,
      theme_occurrence_weight: 4,
      total_occurrence_weight: 4,
    },
    word: { id: 2 },
  });

  assert.ok(
    scoreFahamCandidate(readingCandidate, readingFirstConfig) >
      scoreFahamCandidate(themeCandidate, readingFirstConfig),
  );
  assert.ok(
    scoreFahamCandidate(themeCandidate, themeFirstConfig) >
      scoreFahamCandidate(readingCandidate, themeFirstConfig),
  );
});

test("due backlog pauses new card release", () => {
  const config = normalizeFahamEngineConfig({
    newLimit: 3,
    pauseNewCardsAboveDueCount: 2,
  });

  const plan = buildFahamQueuePlan({
    candidates: [buildCandidate(), buildCandidate({ word: { id: 2 } })],
    config,
    dueCards: [buildDueCard(1), buildDueCard(2)],
  });

  assert.equal(plan.blockedReason, "due_backlog");
  assert.equal(plan.newCandidates.length, 0);
  assert.equal(plan.dueCards.length, 2);
});

test("plan releases capped number of new candidates when due backlog is small", () => {
  const config = normalizeFahamEngineConfig({
    newLimit: 1,
    pauseNewCardsAboveDueCount: 10,
  });

  const plan = buildFahamQueuePlan({
    candidates: [
      buildCandidate({
        summary: { theme_occurrence_weight: 5, total_occurrence_weight: 5 },
      }),
      buildCandidate({
        summary: { reading_occurrence_weight: 3, total_occurrence_weight: 3 },
        word: { id: 2, frequency: 10 },
      }),
    ],
    config,
    dueCards: [buildDueCard(1)],
  });

  assert.equal(plan.blockedReason, null);
  assert.equal(plan.newCandidates.length, 1);
  assert.equal(plan.stats.dueCount, 1);
});

test("normalize config removes duplicate preferred sources", () => {
  const config = normalizeFahamEngineConfig({
    preferredSources: ["theme_chunk", "theme_chunk", "reading_page"],
  });

  assert.deepEqual(config.preferredSources, ["theme_chunk", "reading_page"]);
  assert.equal(config.candidatePoolSize, DEFAULT_FAHAM_ENGINE_CONFIG.candidatePoolSize);
});
