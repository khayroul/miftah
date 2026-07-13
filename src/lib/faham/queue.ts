import type { FahamSourceType } from "@/types/database";
import { TOP_FAHAM_WORD_LIMIT } from "./config";
import {
  buildFahamLevelProgress,
  type FahamLevelProgress,
} from "./levels";
import type { FahamBuiltMcq, FahamMcqDirectionMode } from "./mcq";
import { buildFahamMcqForWord, normalizeMalayMeaning } from "./mcq";
import {
  buildFahamQueuePlan,
  normalizeFahamEngineConfig,
} from "./engine";
import {
  type FahamRecentExposureSource,
  getBootstrapFahamCards,
  getDueFahamCards,
  getFahamExposureCandidates,
  getFahamMcqWordPool,
  getLearningFahamCards,
  getMasteredFahamCards,
  getRecentFahamExposureSources,
  materializeNewFahamCards,
} from "@/data/repositories/faham";
import { getFahamLevelState } from "@/data/repositories/faham-levels";

interface QueueOverrides {
  directionMode?: FahamMcqDirectionMode;
  dueLimit?: number;
  sessionSize?: number;
  minDistinctContextCount?: number;
  minExposureEventCount?: number;
  minOccurrenceWeight?: number;
  newLimit?: number;
  newWeight?: number;
  dueWeight?: number;
  masteredWeight?: number;
  pauseNewCardsAboveDueCount?: number;
  preferredSources?: FahamSourceType[];
  isRevision?: boolean;
}

export interface SerializedFahamCard {
  due: string;
  exposure?: {
    distinctContextCount: number;
    exposureEventCount: number;
    hifzOccurrenceWeight: number;
    readingOccurrenceWeight: number;
    themeOccurrenceWeight: number;
  };
  fsrs: {
    difficulty: number;
    elapsedDays: number;
    lapses: number;
    lastReview: string | null;
    scheduledDays: number;
    stability: number;
  };
  kind: "due" | "new" | "mastered";
  mcq: FahamBuiltMcq;
  mistakeStreak: number;
  needsReinforcement: boolean;
  progressId: number;
  reps: number;
  sourceContext?: SerializedFahamSourceContext;
  state: number;
  word: {
    frequency: number;
    id: number;
    textSimple: string;
    textUthmani: string;
    translationBm: string | null;
    translationEn: string | null;
    transliteration: string | null;
  };
}

export interface SerializedFahamPrimaryReference {
  ayahNumber: number;
  href: string | null;
  label: string;
  pageNumber: number | null;
  position: number;
  surahId: number;
}

export interface SerializedFahamSourceLink {
  detail: string;
  href: string;
  label: string;
  type: FahamSourceType;
}

export interface SerializedFahamSourceContext {
  primaryReference: SerializedFahamPrimaryReference | null;
  sources: SerializedFahamSourceLink[];
}

export interface FahamQueueSnapshot {
  blockedReason: "due_backlog" | null;
  due: SerializedFahamCard[];
  levelProgress: FahamLevelProgress;
  new: SerializedFahamCard[];
  mastered: SerializedFahamCard[];
  learning: SerializedFahamCard[];
  stats: {
    dueCount: number;
    eligibleNewCount: number;
    focusWordLimit: number;
    totalCandidateCount: number;
    masteredCount: number;
    learningCount: number;
  };
}

type FahamDueCard = Awaited<ReturnType<typeof getDueFahamCards>>[number];

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}

function toPositiveInt(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    return null;
  }
  return value;
}

function buildPrimaryReference(card: FahamDueCard): SerializedFahamPrimaryReference | null {
  const occurrence = firstRelation(card.word.word_occurrences);
  const ayah = occurrence ? firstRelation(occurrence.ayat) : null;
  const surahId = toPositiveInt(ayah?.surah_id);
  const ayahNumber = toPositiveInt(ayah?.ayah_number);
  const position = toPositiveInt(occurrence?.position);
  if (!surahId || !ayahNumber || !position) {
    return null;
  }

  const pageNumber = toPositiveInt(occurrence?.page_number);

  return {
    ayahNumber,
    href: pageNumber ? `/read/${pageNumber}` : null,
    label: `${surahId}:${ayahNumber}`,
    pageNumber,
    position,
    surahId,
  };
}

function buildSourceLinks(
  rows: FahamRecentExposureSource[],
  primaryReference: SerializedFahamPrimaryReference | null,
): SerializedFahamSourceLink[] {
  const deduped = new Set<string>();
  const links: SerializedFahamSourceLink[] = [];

  for (const row of rows) {
    if (row.sourceType === "reading_page") {
      const pageNumber = toPositiveInt(row.pageNumber) ?? primaryReference?.pageNumber ?? null;
      if (!pageNumber) {
        continue;
      }

      const key = row.sourceKey ?? `reading-page:${pageNumber}`;
      if (deduped.has(key)) {
        continue;
      }
      deduped.add(key);
      links.push({
        detail:
          primaryReference && primaryReference.label
            ? `Kembali ke ayat ${primaryReference.label} dalam mushaf.`
            : `Kembali ke halaman ${pageNumber} dalam mushaf.`,
        href: `/read/${pageNumber}`,
        label: `Baca · Halaman ${pageNumber}`,
        type: "reading_page",
      });
      continue;
    }

    if (row.sourceType === "theme_chunk") {
      const surahId = toPositiveInt(row.surahId);
      const chunkIndex = toPositiveInt(row.themeChunkIndex);
      if (!surahId || !chunkIndex) {
        continue;
      }

      const key = row.sourceKey ?? `theme-chunk:${surahId}:${chunkIndex}`;
      if (deduped.has(key)) {
        continue;
      }
      deduped.add(key);
      links.push({
        detail: `Buka semula bacaan bertema surah ${surahId}, bahagian ${chunkIndex}.`,
        href: `/read/surah/${surahId}/themes?chunk=${chunkIndex}`,
        label: `Tema · Surah ${surahId}, Bahagian ${chunkIndex}`,
        type: "theme_chunk",
      });
      continue;
    }

    if (!primaryReference?.pageNumber) {
      continue;
    }

    const key = row.sourceKey ?? `hifz-ayah:${primaryReference.label}`;
    if (deduped.has(key)) {
      continue;
    }
    deduped.add(key);
    links.push({
      detail: `Buka semula halaman hafalan yang mengandungi ayat ${primaryReference.label}.`,
      href: `/read/${primaryReference.pageNumber}?mode=hifz&from=dashboard`,
      label: `Hafal · ${primaryReference.label}`,
      type: "hifz_ayah",
    });
  }

  return links.slice(0, 3);
}

function attachSourceContext(
  cards: SerializedFahamCard[],
  sourcesByWordId: Map<number, FahamRecentExposureSource[]>,
): SerializedFahamCard[] {
  return cards.map((card) => ({
    ...card,
    sourceContext:
      card.sourceContext?.primaryReference || (sourcesByWordId.get(card.word.id)?.length ?? 0) > 0
        ? {
            primaryReference: card.sourceContext?.primaryReference ?? null,
            sources: buildSourceLinks(
              sourcesByWordId.get(card.word.id) ?? [],
              card.sourceContext?.primaryReference ?? null,
            ),
          }
        : undefined,
  }));
}

function serializeCard(
  card: FahamDueCard,
  kind: "due" | "new" | "mastered",
  mcqPool: Awaited<ReturnType<typeof getFahamMcqWordPool>>,
  directionMode: FahamMcqDirectionMode,
): SerializedFahamCard | null {
  const translationBm = normalizeMalayMeaning(card.word.translation_bm);
  const mcq = buildFahamMcqForWord(
    card.word,
    mcqPool,
    directionMode,
    4,
    card.progress.reps,
  );
  if (!translationBm || !mcq) {
    return null;
  }

  return {
    due: card.progress.due,
    fsrs: {
      difficulty: card.progress.difficulty,
      elapsedDays: card.progress.elapsed_days,
      lapses: card.progress.lapses,
      lastReview: card.progress.last_review,
      scheduledDays: card.progress.scheduled_days,
      stability: card.progress.stability,
    },
    kind,
    mcq,
    mistakeStreak: card.progress.mistake_streak,
    needsReinforcement: card.progress.needs_reinforcement,
    progressId: card.progress.id,
    reps: card.progress.reps,
    sourceContext: {
      primaryReference: buildPrimaryReference(card),
      sources: [],
    },
    state: card.progress.state,
    word: {
      frequency: card.word.frequency,
      id: card.word.id,
      textSimple: card.word.text_simple,
      textUthmani: card.word.text_uthmani,
      translationBm,
      translationEn: card.word.translation_en,
      transliteration: card.word.transliteration,
    },
  };
}

export async function buildFahamQueueSnapshot(
  userId: string,
  overrides: QueueOverrides = {},
): Promise<FahamQueueSnapshot> {
  const config = normalizeFahamEngineConfig(overrides);
  const levelState = await getFahamLevelState(userId);
  const levelProgress = buildFahamLevelProgress(levelState);
  const focusWordLimit = levelState.activeWordLimit;
  const reinforcementPoolLimit = Math.max(config.sessionSize * 6, 120);
  const [dueCardsPool, candidatesPool, masteredPool, learningPool] = await Promise.all([
    getDueFahamCards(
      userId,
      Math.max(reinforcementPoolLimit, config.pauseNewCardsAboveDueCount),
      focusWordLimit,
    ),
    getFahamExposureCandidates(userId, config.candidatePoolSize, focusWordLimit),
    getMasteredFahamCards(userId, reinforcementPoolLimit, focusWordLimit),
    getLearningFahamCards(userId, reinforcementPoolLimit, focusWordLimit),
  ]);

  const plan = buildFahamQueuePlan({
    candidates: candidatesPool,
    config,
    dueCards: dueCardsPool,
    masteredCards: masteredPool,
    learningCards: learningPool,
    isRevision: overrides.isRevision,
  });

  const [newCards, mcqPool] = await Promise.all([
    materializeNewFahamCards(userId, plan.newCandidates),
    getFahamMcqWordPool(1200, focusWordLimit),
  ]);

  const directionMode = overrides.directionMode ?? "arab_to_bm";
  const candidateByWordId = new Map(
    plan.newCandidates.map((candidate) => [candidate.word.id, candidate]),
  );

  const surfacedDueCards = plan.dueCards
    .map((card) => serializeCard(card, "due", mcqPool, directionMode))
    .filter((card): card is SerializedFahamCard => card !== null);

  const surfacedMasteredCards = plan.masteredCards
    .map((card) => serializeCard(card, "mastered", mcqPool, directionMode))
    .filter((card): card is SerializedFahamCard => card !== null);

  const surfacedLearningCards = (plan.learningCards ?? [])
    .map((card) => serializeCard(card, "due", mcqPool, directionMode))
    .filter((card): card is SerializedFahamCard => card !== null);

  const surfacedNewCards: SerializedFahamCard[] = [];
  for (const card of newCards) {
    const serialized = serializeCard(card, "new", mcqPool, directionMode);
    if (!serialized) {
      continue;
    }

    const candidate = candidateByWordId.get(card.word.id);
    surfacedNewCards.push({
      ...serialized,
      exposure: candidate
        ? {
            distinctContextCount: candidate.summary.distinct_context_count,
            exposureEventCount: candidate.summary.exposure_event_count,
            hifzOccurrenceWeight: candidate.summary.hifz_occurrence_weight,
            readingOccurrenceWeight: candidate.summary.reading_occurrence_weight,
            themeOccurrenceWeight: candidate.summary.theme_occurrence_weight,
          }
        : undefined,
    });
  }

  const sourceWordIds = Array.from(
    new Set(
      [
        ...surfacedDueCards,
        ...surfacedLearningCards,
        ...surfacedMasteredCards,
        ...surfacedNewCards,
      ].map((card) => card.word.id),
    ),
  );
  const recentSources = await getRecentFahamExposureSources(userId, sourceWordIds);
  const sourcesByWordId = new Map<number, FahamRecentExposureSource[]>();
  for (const source of recentSources) {
    const current = sourcesByWordId.get(source.wordId) ?? [];
    current.push(source);
    sourcesByWordId.set(source.wordId, current);
  }

  const dueCardsWithContext = attachSourceContext(surfacedDueCards, sourcesByWordId);
  const masteredCardsWithContext = attachSourceContext(
    surfacedMasteredCards,
    sourcesByWordId,
  );
  const learningCardsWithContext = attachSourceContext(
    surfacedLearningCards,
    sourcesByWordId,
  );
  const newCardsWithContext = attachSourceContext(surfacedNewCards, sourcesByWordId);

  const surfaceCount =
    dueCardsWithContext.length +
    learningCardsWithContext.length +
    masteredCardsWithContext.length +
    newCardsWithContext.length;
  if (surfaceCount === 0) {
    const fallbackQueue: SerializedFahamCard[] = [];
    const seenProgressIds = new Set<number>();
    const pushUnique = (card: SerializedFahamCard | null) => {
      if (!card || seenProgressIds.has(card.progressId)) {
        return;
      }
      seenProgressIds.add(card.progressId);
      fallbackQueue.push(card);
    };

    for (const card of learningPool) {
      if (fallbackQueue.length >= config.sessionSize) break;
      pushUnique(serializeCard(card, "due", mcqPool, directionMode));
    }
    for (const card of dueCardsPool) {
      if (fallbackQueue.length >= config.sessionSize) break;
      pushUnique(serializeCard(card, "due", mcqPool, directionMode));
    }
    for (const card of masteredPool) {
      if (fallbackQueue.length >= config.sessionSize) break;
      pushUnique(serializeCard(card, "mastered", mcqPool, directionMode));
    }

    if (fallbackQueue.length < config.sessionSize) {
      const bootstrapCards = await getBootstrapFahamCards(
        userId,
        config.sessionSize - fallbackQueue.length,
        focusWordLimit,
      );
      for (const card of bootstrapCards) {
        if (fallbackQueue.length >= config.sessionSize) break;
        pushUnique(serializeCard(card, "new", mcqPool, directionMode));
      }
    }

    const fallbackDueCards = fallbackQueue.filter((card) => card.kind === "due");
    const fallbackMasteredCards = fallbackQueue.filter((card) => card.kind === "mastered");
    const fallbackNewCards = fallbackQueue.filter((card) => card.kind === "new");

    return {
      blockedReason: plan.blockedReason,
      due: fallbackDueCards,
      levelProgress,
      new: fallbackNewCards,
      mastered: fallbackMasteredCards,
      learning: [],
      stats: {
        ...plan.stats,
        focusWordLimit: Math.min(TOP_FAHAM_WORD_LIMIT, focusWordLimit),
      },
    };
  }

  return {
    blockedReason: plan.blockedReason,
    due: dueCardsWithContext,
    levelProgress,
    new: newCardsWithContext,
    mastered: masteredCardsWithContext,
    learning: learningCardsWithContext,
    stats: {
      ...plan.stats,
      focusWordLimit: Math.min(TOP_FAHAM_WORD_LIMIT, focusWordLimit),
    },
  };
}
