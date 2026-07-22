import type { Word } from "@/shared/types/database";
import { getAudioKey, getAudioUrlForKey, getMalayAudioUrl } from "./mcqAudio";
import {
  buildWhyThisSetNotes,
  deterministicOrder,
  hashSeed,
  normalizeArabicText,
  normalizeMeaning,
  poolWordMeaning,
  scoreArabicDistractor,
  scoreMeaningDistractor,
  selectDistractors,
} from "./mcqSelection";
import type {
  FahamBuiltMcq,
  FahamMcqDirection,
  FahamMcqDirectionMode,
  FahamMcqPoolWord,
  FahamMeaningLocale,
} from "./mcqTypes";
import type { WordWithOccurrences } from "./types";

/** The meaning-side translation of a Word in the requested language. */
function wordMeaningFor(
  word: WordWithOccurrences,
  meaningLocale: FahamMeaningLocale,
): string | null {
  return meaningLocale === "en" ? word.translation_en : word.translation_bm;
}

/** The OTHER-language gloss, shown as `answerSecondary`/`promptSecondary`. */
function crossGlossFor(
  word: WordWithOccurrences,
  meaningLocale: FahamMeaningLocale,
): string | null {
  const gloss = meaningLocale === "en" ? word.translation_bm : word.translation_en;
  return gloss?.trim() || null;
}

function buildArabicToMalayMcq(
  word: WordWithOccurrences,
  pool: FahamMcqPoolWord[],
  optionCount: number,
  attemptSeed: string | number,
  meaningLocale: FahamMeaningLocale,
): FahamBuiltMcq | null {
  const correctMeaning = normalizeMeaning(wordMeaningFor(word, meaningLocale));
  const correctArabic = normalizeArabicText(word.text_uthmani);
  if (!correctMeaning || !correctArabic) {
    return null;
  }

  const distractorCount = Math.max(1, optionCount - 1);
  const distractors = selectDistractors({
    correctWord: word,
    count: distractorCount,
    pool,
    scoreCandidate: (correctWord, candidate) =>
      scoreMeaningDistractor(correctWord, candidate, meaningLocale),
    toChoiceValue: (candidate) =>
      normalizeMeaning(poolWordMeaning(candidate, meaningLocale)),
    correctChoiceValue: correctMeaning,
  });
  if (distractors.length < distractorCount) {
    return null;
  }

  const selectedDistractors = distractors.slice(0, distractorCount);
  // Fold the per-attempt seed into the ordering key so repeated words do not
  // keep the same option positions. The correct index comes from this same
  // deterministic array, keeping server and client builds synchronized. The
  // seed prefix is parameterized by meaningLocale ("bm-options" for ms —
  // unchanged so MS output stays byte-identical to pre-change — "en-options"
  // for en) so MS and EN sessions get independent-but-deterministic orders.
  const optionSeedPrefix = meaningLocale === "en" ? "en-options" : "bm-options";
  const optionValues = deterministicOrder(
    [correctMeaning, ...selectedDistractors],
    `${optionSeedPrefix}:${word.id}:${attemptSeed}`,
    (item) => item,
  );
  const correctIndex = optionValues.findIndex((item) => item === correctMeaning);
  if (correctIndex < 0) {
    return null;
  }

  // answerLabel/promptLabel/promptHint below are retained for payload
  // compatibility (offline-cached MCQs and bot code still carry these
  // fields) but are no longer read for rendering — FahamStudyCard now
  // resolves the displayed label/hint by `direction` via i18n keys under
  // faham.mcq.* so a locale switch after caching doesn't show a stale
  // language. Do not remove these fields or rely on their values for UI.
  return {
    answerLabel: "Makna BM",
    answerPrimary: correctMeaning,
    answerSecondary: crossGlossFor(word, meaningLocale),
    correctIndex,
    direction: "arab_to_bm",
    options: optionValues.map((value) => ({
      dir: "ltr",
      lang: meaningLocale,
      value,
    })),
    promptAudioUrl: getAudioUrlForKey(getAudioKey(word, pool)),
    promptDir: "rtl",
    promptHint: "Pilih makna BM yang tepat.",
    promptLabel: "Perkataan Arab",
    promptLang: "ar",
    promptPrimary: correctArabic,
    promptSecondary: word.transliteration?.trim() || null,
    // Answer audio is a Malay TTS asset only; there is no English guide voice,
    // so EN meanings degrade to no answer audio (the null is handled by the
    // audio controller — it never falls back to Malay TTS for a non-"ms" lang).
    answerAudioUrl: meaningLocale === "ms" ? getMalayAudioUrl(correctMeaning) : null,
    whyThisSet: buildWhyThisSetNotes(word, "arab_to_bm"),
  };
}

function buildMalayToArabicMcq(
  word: WordWithOccurrences,
  pool: FahamMcqPoolWord[],
  optionCount: number,
  attemptSeed: string | number,
  meaningLocale: FahamMeaningLocale,
): FahamBuiltMcq | null {
  const correctMeaning = normalizeMeaning(wordMeaningFor(word, meaningLocale));
  const correctArabic = normalizeArabicText(word.text_uthmani);
  if (!correctMeaning || !correctArabic) {
    return null;
  }

  const distractorCount = Math.max(1, optionCount - 1);
  const distractors = selectDistractors({
    correctWord: word,
    count: distractorCount,
    pool,
    scoreCandidate: (correctWord, candidate) =>
      scoreArabicDistractor(correctWord, candidate, meaningLocale),
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

  // See the comment on buildArabicToMalayMcq's return above: these label
  // fields are payload-compat only, not used for rendering.
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
    // The prompt is the meaning here; Malay TTS only, so EN meaning prompts
    // degrade to no prompt audio.
    promptAudioUrl: meaningLocale === "ms" ? getMalayAudioUrl(correctMeaning) : null,
    promptDir: "ltr",
    promptHint: "Pilih perkataan Arab yang tepat.",
    promptLabel: "Makna BM",
    promptLang: meaningLocale,
    promptPrimary: correctMeaning,
    promptSecondary: crossGlossFor(word, meaningLocale),
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
  meaningLocale: FahamMeaningLocale = "ms",
): FahamBuiltMcq | null {
  const directions = resolveDirectionOrder(word, directionMode, attemptSeed);

  for (const direction of directions) {
    const built = direction === "arab_to_bm"
      ? buildArabicToMalayMcq(word, pool, optionCount, attemptSeed, meaningLocale)
      : buildMalayToArabicMcq(word, pool, optionCount, attemptSeed, meaningLocale);
    if (built) {
      return built;
    }
  }

  return null;
}
