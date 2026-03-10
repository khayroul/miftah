import type { Word } from "@/types/database";

export type FahamMcqDirection = "arab_to_bm" | "bm_to_arab";
export type FahamMcqDirectionMode = FahamMcqDirection | "mixed";

export interface FahamMcqPoolWord {
  frequency: number;
  id: number;
  pos: string | null;
  textSimple: string;
  textUthmani: string;
  translationBm: string | null;
  transliteration: string | null;
}

export interface FahamMcqOption {
  dir: "ltr" | "rtl";
  lang: "ar" | "ms";
  value: string;
}

export interface FahamBuiltMcq {
  answerLabel: string;
  answerPrimary: string;
  answerSecondary: string | null;
  correctIndex: number;
  direction: FahamMcqDirection;
  options: FahamMcqOption[];
  promptDir: "ltr" | "rtl";
  promptHint: string;
  promptLabel: string;
  promptLang: "ar" | "ms";
  promptPrimary: string;
  promptSecondary: string | null;
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function tokenizeMeaning(value: string): string[] {
  return collapseWhitespace(value)
    .toLowerCase()
    .split(/[\s,;:/()]+/)
    .filter((token) => token.length > 0);
}

function tokenizeArabic(value: string): string[] {
  return collapseWhitespace(value)
    .split(/\s+/)
    .filter((token) => token.length > 0);
}

function hashSeed(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function deterministicOrder<T>(items: T[], seed: string, toKey: (item: T) => string): T[] {
  return [...items].sort((left, right) => {
    const leftHash = hashSeed(`${seed}:${toKey(left)}`);
    const rightHash = hashSeed(`${seed}:${toKey(right)}`);
    if (leftHash !== rightHash) {
      return leftHash - rightHash;
    }
    return toKey(left).localeCompare(toKey(right));
  });
}

function proximityScore(left: number, right: number, maxScore: number, spread: number): number {
  return Math.max(0, maxScore - Math.abs(left - right) / spread);
}

function posScore(correctPos: string | null, candidatePos: string | null): number {
  if (!correctPos || !candidatePos) {
    return 0;
  }
  return correctPos === candidatePos ? 18 : -4;
}

function normalizeArabicText(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = collapseWhitespace(value);
  return normalized.length > 0 ? normalized : null;
}

export function normalizeMalayMeaning(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = collapseWhitespace(value);
  return normalized.length > 0 ? normalized : null;
}

function meaningOverlapPenalty(correctMeaning: string, candidateMeaning: string): number {
  const correctTokens = tokenizeMeaning(correctMeaning);
  const candidateTokens = tokenizeMeaning(candidateMeaning);
  const correctSet = new Set(correctTokens);
  return candidateTokens.filter((token) => correctSet.has(token)).length * 7;
}

function scoreMalayDistractor(correctWord: Word, candidate: FahamMcqPoolWord): number {
  const correctMeaning = normalizeMalayMeaning(correctWord.translation_bm);
  const candidateMeaning = normalizeMalayMeaning(candidate.translationBm);
  if (!correctMeaning || !candidateMeaning) {
    return Number.NEGATIVE_INFINITY;
  }

  return (
    posScore(correctWord.pos, candidate.pos) +
    proximityScore(correctMeaning.length, candidateMeaning.length, 22, 1.6) +
    proximityScore(
      tokenizeMeaning(correctMeaning).length,
      tokenizeMeaning(candidateMeaning).length,
      14,
      0.7,
    ) +
    proximityScore(correctWord.frequency, candidate.frequency, 12, 65) +
    (correctMeaning.includes(",") === candidateMeaning.includes(",") ? 3 : 0) -
    meaningOverlapPenalty(correctMeaning, candidateMeaning)
  );
}

function scoreArabicDistractor(correctWord: Word, candidate: FahamMcqPoolWord): number {
  const correctArabic = normalizeArabicText(correctWord.text_uthmani);
  const candidateArabic = normalizeArabicText(candidate.textUthmani);
  if (!correctArabic || !candidateArabic) {
    return Number.NEGATIVE_INFINITY;
  }

  const correctMeaning = normalizeMalayMeaning(correctWord.translation_bm);
  const candidateMeaning = normalizeMalayMeaning(candidate.translationBm);

  return (
    posScore(correctWord.pos, candidate.pos) +
    proximityScore(correctArabic.length, candidateArabic.length, 22, 1.25) +
    proximityScore(
      tokenizeArabic(correctArabic).length,
      tokenizeArabic(candidateArabic).length,
      12,
      0.8,
    ) +
    proximityScore(correctWord.frequency, candidate.frequency, 10, 70) +
    (correctMeaning && candidateMeaning
      ? proximityScore(correctMeaning.length, candidateMeaning.length, 8, 2)
      : 0)
  );
}

function selectDistractors(params: {
  correctWord: Word;
  count: number;
  pool: FahamMcqPoolWord[];
  scoreCandidate: (correctWord: Word, candidate: FahamMcqPoolWord) => number;
  toChoiceValue: (candidate: FahamMcqPoolWord) => string | null;
}): string[] {
  const { correctWord, count, pool, scoreCandidate, toChoiceValue } = params;
  const seen = new Set<string>();
  const ranked = pool
    .filter((candidate) => candidate.id !== correctWord.id)
    .map((candidate) => {
      const choiceValue = toChoiceValue(candidate);
      return choiceValue
        ? {
            choiceValue,
            score: scoreCandidate(correctWord, candidate),
          }
        : null;
    })
    .filter((candidate): candidate is { choiceValue: string; score: number } => {
      return candidate !== null && Number.isFinite(candidate.score);
    })
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.choiceValue.localeCompare(right.choiceValue);
    });

  const deduped: string[] = [];
  for (const candidate of ranked) {
    if (seen.has(candidate.choiceValue)) {
      continue;
    }
    seen.add(candidate.choiceValue);
    deduped.push(candidate.choiceValue);
  }

  return deduped.slice(0, Math.max(count * 6, count));
}

function buildArabicToMalayMcq(
  word: Word,
  pool: FahamMcqPoolWord[],
  optionCount: number,
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
  });
  if (distractors.length < distractorCount) {
    return null;
  }

  const selectedDistractors = deterministicOrder(
    distractors.slice(0, Math.max(distractorCount * 3, distractorCount)),
    `bm:${word.id}:${correctMeaning}`,
    (item) => item,
  ).slice(0, distractorCount);
  const optionValues = deterministicOrder(
    [correctMeaning, ...selectedDistractors],
    `bm-options:${word.id}`,
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
    promptDir: "rtl",
    promptHint: "Pilih makna BM paling tepat untuk perkataan Arab ini.",
    promptLabel: "Perkataan Arab",
    promptLang: "ar",
    promptPrimary: correctArabic,
    promptSecondary: word.transliteration?.trim() || null,
  };
}

function buildMalayToArabicMcq(
  word: Word,
  pool: FahamMcqPoolWord[],
  optionCount: number,
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
  });
  if (distractors.length < distractorCount) {
    return null;
  }

  const selectedDistractors = deterministicOrder(
    distractors.slice(0, Math.max(distractorCount * 3, distractorCount)),
    `ar:${word.id}:${correctArabic}`,
    (item) => item,
  ).slice(0, distractorCount);
  const optionValues = deterministicOrder(
    [correctArabic, ...selectedDistractors],
    `ar-options:${word.id}`,
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
    promptDir: "ltr",
    promptHint: "Pilih perkataan Arab yang paling sepadan dengan makna BM ini.",
    promptLabel: "Makna BM",
    promptLang: "ms",
    promptPrimary: correctMeaning,
    promptSecondary: word.translation_en?.trim() || null,
  };
}

function resolveDirectionOrder(word: Word, mode: FahamMcqDirectionMode): FahamMcqDirection[] {
  if (mode === "arab_to_bm" || mode === "bm_to_arab") {
    return [mode];
  }

  const mixedSeed = hashSeed(`${word.id}:${word.text_simple}`);
  return mixedSeed % 2 === 0
    ? ["arab_to_bm", "bm_to_arab"]
    : ["bm_to_arab", "arab_to_bm"];
}

export function buildFahamMcqForWord(
  word: Word,
  pool: FahamMcqPoolWord[],
  directionMode: FahamMcqDirectionMode,
  optionCount = 4,
): FahamBuiltMcq | null {
  const directions = resolveDirectionOrder(word, directionMode);

  for (const direction of directions) {
    const built = direction === "arab_to_bm"
      ? buildArabicToMalayMcq(word, pool, optionCount)
      : buildMalayToArabicMcq(word, pool, optionCount);
    if (built) {
      return built;
    }
  }

  return null;
}
