"use client";

import { FAHAM_LEMMA_UNLOCK_LEVEL, FAHAM_LEVEL_WORD_LIMITS } from "./config";
import { loadFahamExposureSignals, type FahamExposureSignal } from "./exposureSync";
import type { FahamLevelProgress } from "./levels";
import {
  buildFahamMcqForWord,
  normalizeMeaning,
  type FahamMcqDirectionMode,
  type FahamMcqPoolWord,
  type FahamMeaningLocale,
} from "./mcq";
import type {
  FahamQueueSnapshot,
  SerializedFahamCard,
  SerializedFahamSourceContext,
  SerializedFahamSourceLink,
} from "./queue";
import { FAHAM_PRESET_CONFIGS, type FahamSourcePreset } from "./presets";
import {
  loadCachedFahamTierVocabPackage,
  type CachedFahamTierVocabPayload,
} from "./tierVocabPackage";
import type { WordWithOccurrences } from "./types";
import { loadPwaConfig } from "@/shared/pwa/downloadConfig";

const OFFLINE_SESSION_SIZE = 10;
const POOL_SIZE = 1200;
const SOURCE_WEIGHT_BY_ORDER = [7, 5, 3] as const;

function hashSeed(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function normalizeLevelProgress(
  payload: CachedFahamTierVocabPayload,
  levelProgressHint?: FahamLevelProgress | null,
): FahamLevelProgress {
  if (
    levelProgressHint &&
    levelProgressHint.activeWordLimit > 0 &&
    levelProgressHint.activeWordLimit <= payload.wordLimit
  ) {
    return {
      ...levelProgressHint,
      activeWordLimit: payload.wordLimit,
    };
  }

  const maxLevel = payload.maxLevel;
  const activeLevel = Math.max(1, Math.min(payload.level, maxLevel));
  const isMaxLevel = activeLevel >= maxLevel;
  const nextLevel = isMaxLevel ? null : activeLevel + 1;
  const nextWordLimit = nextLevel
    ? FAHAM_LEVEL_WORD_LIMITS[nextLevel - 1] ?? null
    : null;
  const unlockFoundRequired = Math.ceil(payload.wordLimit * 0.6);

  return {
    activeLevel,
    activeWordLimit: payload.wordLimit,
    isMaxLevel,
    lemmaUnlocked: activeLevel >= FAHAM_LEMMA_UNLOCK_LEVEL,
    maxLevel,
    nextLevel,
    nextWordLimit,
    unlockFoundProgress: 0,
    unlockFoundRequired,
    unlockMasteredProgress: 0,
    unlockMasteredRequired: 0,
    unlockReady: false,
  };
}

function buildSourceWeights(preset: FahamSourcePreset): Record<string, number> {
  const preferredSources = FAHAM_PRESET_CONFIGS[preset].preferredSources;
  const weights: Record<string, number> = {
    reading_page: 1,
    theme_chunk: 1,
    hifz_ayah: 1,
  };

  preferredSources.forEach((source, index) => {
    weights[source] = SOURCE_WEIGHT_BY_ORDER[index] ?? 1;
  });

  return weights;
}

function buildSourceLinks(
  exposureSignals: FahamExposureSignal[],
): SerializedFahamSourceLink[] {
  const deduped = new Set<string>();
  const links: SerializedFahamSourceLink[] = [];

  for (const signal of exposureSignals) {
    if (deduped.has(signal.sourceKey)) {
      continue;
    }
    deduped.add(signal.sourceKey);

    if (signal.sourceType === "reading_page" && signal.pageNumber) {
      links.push({
        href: `/read/${signal.pageNumber}`,
        origin: "offline",
        pageNumber: signal.pageNumber,
        type: "reading_page",
      });
      continue;
    }

    if (
      signal.sourceType === "theme_chunk" &&
      signal.surahId &&
      signal.themeChunkIndex
    ) {
      links.push({
        href: `/read/surah/${signal.surahId}/themes?chunk=${signal.themeChunkIndex}`,
        origin: "offline",
        surahId: signal.surahId,
        themeChunkIndex: signal.themeChunkIndex,
        type: "theme_chunk",
      });
      continue;
    }

    if (signal.sourceType === "hifz_ayah") {
      links.push({
        href: "/hifz",
        origin: "offline",
        type: "hifz_ayah",
      });
      continue;
    }
  }

  return links.slice(0, 3);
}

function buildSourceContext(
  exposureSignals: FahamExposureSignal[],
): SerializedFahamSourceContext | undefined {
  const links = buildSourceLinks(exposureSignals);
  if (links.length === 0) {
    return undefined;
  }

  return {
    primaryReference: null,
    sources: links,
  };
}

function toPoolWord(
  word: CachedFahamTierVocabPayload["words"][number],
): FahamMcqPoolWord {
  return {
    audioKey: null,
    frequency: word.frequency,
    id: word.id,
    lemma: null,
    pos: null,
    root: null,
    textSimple: word.textSimple,
    textUthmani: word.textUthmani,
    translationBm: word.translationBm,
    translationEn: word.translationEn,
    transliteration: word.transliteration,
  };
}

function toWordWithOccurrences(
  word: CachedFahamTierVocabPayload["words"][number],
): WordWithOccurrences {
  return {
    id: word.id,
    text_uthmani: word.textUthmani,
    text_simple: word.textSimple,
    translation_bm: word.translationBm,
    translation_en: word.translationEn,
    transliteration: word.transliteration,
    root: null,
    lemma: null,
    pos: null,
    frequency: word.frequency,
    word_occurrences: null,
  };
}

function scoreWordForOfflineQueue(
  word: CachedFahamTierVocabPayload["words"][number],
  exposureSignals: FahamExposureSignal[],
  sourceWeights: Record<string, number>,
  meaningLocale: FahamMeaningLocale,
): number {
  const normalizedMeaning = normalizeMeaning(
    meaningLocale === "en" ? word.translationEn : word.translationBm,
  );
  if (!normalizedMeaning) {
    return Number.NEGATIVE_INFINITY;
  }

  let score = Math.min(word.frequency, 2000) * 10;
  const seed = exposureSignals.map((signal) => signal.sourceKey).join("|");
  if (seed.length > 0) {
    const signalMix = exposureSignals.reduce((sum, signal, index) => {
      const matchHash = hashSeed(`${word.id}:${signal.sourceKey}:${index}`);
      const sourceBoost = sourceWeights[signal.sourceType] ?? 1;
      const recencyWeight = Math.max(1, exposureSignals.length - index);
      return sum + ((matchHash % 97) / 97) * sourceBoost * recencyWeight * 25;
    }, 0);
    score += signalMix;
  }

  return score;
}

export function buildOfflineFahamQueueSnapshotFromTierPayload(params: {
  directionMode: FahamMcqDirectionMode;
  meaningLocale: FahamMeaningLocale;
  exposureSignals?: FahamExposureSignal[];
  isRevision: boolean;
  levelProgressHint?: FahamLevelProgress | null;
  payload: CachedFahamTierVocabPayload;
  preset: FahamSourcePreset;
}): FahamQueueSnapshot {
  const exposureSignals = params.exposureSignals ?? [];
  const sourceWeights = buildSourceWeights(params.preset);
  const sourceContext = buildSourceContext(exposureSignals);
  const nowIso = new Date().toISOString();
  const levelProgress = normalizeLevelProgress(params.payload, params.levelProgressHint);
  const pool = params.payload.words.slice(0, POOL_SIZE).map(toPoolWord);

  const rankedWords = params.payload.words
    .map((word) => ({
      score: scoreWordForOfflineQueue(
        word,
        exposureSignals,
        sourceWeights,
        params.meaningLocale,
      ),
      word,
    }))
    .filter((entry) => Number.isFinite(entry.score))
    .sort((left, right) => {
      if (left.score !== right.score) {
        return right.score - left.score;
      }
      return right.word.frequency - left.word.frequency;
    });

  const cards: SerializedFahamCard[] = [];
  for (const entry of rankedWords) {
    if (cards.length >= OFFLINE_SESSION_SIZE) {
      break;
    }

    const word = toWordWithOccurrences(entry.word);
    const mcq = buildFahamMcqForWord(
      word,
      pool,
      params.directionMode,
      4,
      nowIso,
      params.meaningLocale,
    );
    if (!mcq) {
      continue;
    }

    cards.push({
      due: nowIso,
      exposure: undefined,
      fsrs: {
        difficulty: 0,
        elapsedDays: 0,
        lapses: 0,
        lastReview: null,
        scheduledDays: 0,
        stability: 0,
      },
      kind: params.isRevision ? "due" : "new",
      mcq,
      mistakeStreak: 0,
      needsReinforcement: false,
      progressId: -(cards.length + 1),
      reps: 0,
      sourceContext,
      state: 0,
      word: {
        frequency: entry.word.frequency,
        id: entry.word.id,
        textSimple: entry.word.textSimple,
        textUthmani: entry.word.textUthmani,
        translationBm: entry.word.translationBm,
        translationEn: entry.word.translationEn,
        transliteration: entry.word.transliteration,
      },
    });
  }

  const due = params.isRevision ? cards : [];
  const fresh = params.isRevision ? [] : cards;

  return {
    blockedReason: null,
    due,
    learning: [],
    levelProgress,
    mastered: [],
    new: fresh,
    stats: {
      dueCount: due.length,
      eligibleNewCount: fresh.length,
      focusWordLimit: params.payload.wordLimit,
      learningCount: 0,
      masteredCount: 0,
      totalCandidateCount: rankedWords.length,
    },
  };
}

export async function buildOfflineFahamQueueSnapshot(params: {
  directionMode: FahamMcqDirectionMode;
  meaningLocale: FahamMeaningLocale;
  isRevision: boolean;
  levelProgressHint?: FahamLevelProgress | null;
  preset: FahamSourcePreset;
}): Promise<FahamQueueSnapshot | null> {
  try {
    const config = await loadPwaConfig();
    const payload = await loadCachedFahamTierVocabPackage({
      appBuildId: config.appBuildId ?? "unknown",
      dataVersion: config.fahamDataVersion ?? "1",
      requestedWordLimit: params.levelProgressHint?.activeWordLimit,
    });
    if (!payload) {
      return null;
    }

    return buildOfflineFahamQueueSnapshotFromTierPayload({
      directionMode: params.directionMode,
      meaningLocale: params.meaningLocale,
      exposureSignals: loadFahamExposureSignals(),
      isRevision: params.isRevision,
      levelProgressHint: params.levelProgressHint,
      payload,
      preset: params.preset,
    });
  } catch {
    return null;
  }
}
