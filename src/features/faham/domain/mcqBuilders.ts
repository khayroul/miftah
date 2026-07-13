import type { Word } from "@/types/database";
import { getAudioKey, getAudioUrlForKey, getMalayAudioUrl } from "./mcqAudio";
import {
  buildWhyThisSetNotes,
  deterministicOrder,
  hashSeed,
  normalizeArabicText,
  normalizeMalayMeaning,
  scoreArabicDistractor,
  scoreMalayDistractor,
  selectDistractors,
} from "./mcqSelection";
import type {
  FahamBuiltMcq,
  FahamMcqDirection,
  FahamMcqDirectionMode,
  FahamMcqPoolWord,
} from "./mcqTypes";
import type { WordWithOccurrences } from "./types";

function buildArabicToMalayMcq(
  word: WordWithOccurrences,
  pool: FahamMcqPoolWord[],
  optionCount: number,
  attemptSeed: string | number,
): FahamBuiltMcq | null {
  const correctMeaning = normalizeMalayMeaning(word.translation_bm);
  const correctArabic = normalizeArabicText(word.text_uthmani);
  if (!correctMeaning || !correctArabic) {
    return null;
  }

  const distractorCount = Math.max(1, optionCount - 1);
  const distractors = selectDistractors({
    correctWord: word,
    count: distractorCount,
    pool,
    scoreCandidate: scoreMalayDistractor,
    toChoiceValue: (candidate) => normalizeMalayMeaning(candidate.translationBm),
    correctChoiceValue: correctMeaning,
  });
  if (distractors.length < distractorCount) {
    return null;
  }

  const selectedDistractors = distractors.slice(0, distractorCount);
  // Fold the per-attempt seed into the ordering key so repeated words do not
  // keep the same option positions. The correct index comes from this same
  // deterministic array, keeping server and client builds synchronized.
  const optionValues = deterministicOrder(
    [correctMeaning, ...selectedDistractors],
    `bm-options:${word.id}:${attemptSeed}`,
    (item) => item,
  );
  const correctIndex = optionValues.findIndex((item) => item === correctMeaning);
  if (correctIndex < 0) {
    return null;
  }

  return {
    answerLabel: "Makna BM",
    answerPrimary: correctMeaning,
    answerSecondary: word.translation_en?.trim() || null,
    correctIndex,
    direction: "arab_to_bm",
    options: optionValues.map((value) => ({
      dir: "ltr",
      lang: "ms",
      value,
    })),
    promptAudioUrl: getAudioUrlForKey(getAudioKey(word, pool)),
    promptDir: "rtl",
    promptHint: "Pilih makna BM yang tepat.",
    promptLabel: "Perkataan Arab",
    promptLang: "ar",
    promptPrimary: correctArabic,
    promptSecondary: word.transliteration?.trim() || null,
    answerAudioUrl: getMalayAudioUrl(correctMeaning),
    whyThisSet: buildWhyThisSetNotes(word, "arab_to_bm"),
  };
}

function buildMalayToArabicMcq(
  word: WordWithOccurrences,
  pool: FahamMcqPoolWord[],
  optionCount: number,
  attemptSeed: string | number,
): FahamBuiltMcq | null {
  const correctMeaning = normalizeMalayMeaning(word.translation_bm);
  const correctArabic = normalizeArabicText(word.text_uthmani);
  if (!correctMeaning || !correctArabic) {
    return null;
  }

  const distractorCount = Math.max(1, optionCount - 1);
  const distractors = selectDistractors({
    correctWord: word,
    count: distractorCount,
    pool,
    scoreCandidate: scoreArabicDistractor,
    toChoiceValue: (candidate) => normalizeArabicText(candidate.textUthmani),
    correctChoiceValue: correctArabic,
  });
  if (distractors.length < distractorCount) {
    return null;
  }

  const selectedDistractors = distractors.slice(0, distractorCount);
  const optionValues = deterministicOrder(
    [correctArabic, ...selectedDistractors],
    `ar-options:${word.id}:${attemptSeed}`,
    (item) => item,
  );
  const correctIndex = optionValues.findIndex((item) => item === correctArabic);
  if (correctIndex < 0) {
    return null;
  }

  return {
    answerLabel: "Perkataan Arab",
    answerPrimary: correctArabic,
    answerSecondary: word.transliteration?.trim() || null,
    correctIndex,
    direction: "bm_to_arab",
    options: optionValues.map((value) => ({
      dir: "rtl",
      lang: "ar",
      value,
    })),
    promptAudioUrl: getMalayAudioUrl(correctMeaning),
    promptDir: "ltr",
    promptHint: "Pilih perkataan Arab yang tepat.",
    promptLabel: "Makna BM",
    promptLang: "ms",
    promptPrimary: correctMeaning,
    promptSecondary: word.translation_en?.trim() || null,
    answerAudioUrl: getAudioUrlForKey(getAudioKey(word, pool)),
    whyThisSet: buildWhyThisSetNotes(word, "bm_to_arab"),
  };
}

function resolveDirectionOrder(
  word: Word,
  mode: FahamMcqDirectionMode,
  attemptSeed: string | number,
): FahamMcqDirection[] {
  if (mode === "arab_to_bm" || mode === "bm_to_arab") {
    return [mode];
  }

  const mixedSeed = hashSeed(`${word.id}:${word.text_simple}:${attemptSeed}`);
  return mixedSeed % 2 === 0
    ? ["arab_to_bm", "bm_to_arab"]
    : ["bm_to_arab", "arab_to_bm"];
}

export function buildFahamMcqForWord(
  word: WordWithOccurrences,
  pool: FahamMcqPoolWord[],
  directionMode: FahamMcqDirectionMode,
  optionCount = 4,
  attemptSeed: string | number = 0,
): FahamBuiltMcq | null {
  const directions = resolveDirectionOrder(word, directionMode, attemptSeed);

  for (const direction of directions) {
    const built = direction === "arab_to_bm"
      ? buildArabicToMalayMcq(word, pool, optionCount, attemptSeed)
      : buildMalayToArabicMcq(word, pool, optionCount, attemptSeed);
    if (built) {
      return built;
    }
  }

  return null;
}
