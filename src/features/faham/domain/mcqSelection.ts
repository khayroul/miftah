import type { Word } from "@/shared/types/database";
import type {
  FahamMcqDirection,
  FahamMcqPoolWord,
  FahamMeaningLocale,
} from "./mcqTypes";

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

// Case/whitespace-normalized key used to compare two DISPLAY values for
// equality (e.g. deciding whether a candidate's choice text is really the
// same answer as the correct word's, or just a different pool row that
// happens to render identically). Never used for display — only for set
// membership checks.
function normalizeChoiceValue(value: string): string {
  return collapseWhitespace(value).toLowerCase();
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

export function hashSeed(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

export function deterministicOrder<T>(
  items: T[],
  seed: string,
  toKey: (item: T) => string,
): T[] {
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
  return correctPos === candidatePos ? 22 : -12;
}

function isAbstractPos(pos: string | null): boolean {
  if (!pos) {
    return false;
  }

  const normalized = pos.toLowerCase();
  return (
    normalized.includes("particle") ||
    normalized.includes("prep") ||
    normalized.includes("conj") ||
    normalized.includes("pron")
  );
}

export function normalizeArabicText(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = collapseWhitespace(value);
  return normalized.length > 0 ? normalized : null;
}

// Meaning-language-agnostic: the normalization (whitespace-collapse, empty →
// null) is identical whether the meaning is Malay or English, so this is the
// canonical function. `normalizeMalayMeaning` is retained as a thin alias for
// the many call sites (and tests) that still import the old name.
export function normalizeMeaning(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = collapseWhitespace(value);
  return normalized.length > 0 ? normalized : null;
}

/** @deprecated Use {@link normalizeMeaning}. Kept as a thin alias. */
export function normalizeMalayMeaning(value: string | null | undefined): string | null {
  return normalizeMeaning(value);
}

/** The raw meaning-side translation for a Word in the requested language. */
function wordMeaning(word: Word, meaningLocale: FahamMeaningLocale): string | null {
  return meaningLocale === "en" ? word.translation_en : word.translation_bm;
}

/** The raw meaning-side translation for a pool candidate in the requested language. */
export function poolWordMeaning(
  candidate: FahamMcqPoolWord,
  meaningLocale: FahamMeaningLocale,
): string | null {
  return meaningLocale === "en" ? candidate.translationEn : candidate.translationBm;
}

function meaningOverlapPenalty(correctMeaning: string, candidateMeaning: string): number {
  const correctTokens = tokenizeMeaning(correctMeaning);
  const candidateTokens = tokenizeMeaning(candidateMeaning);
  const correctSet = new Set(correctTokens);
  return candidateTokens.filter((token) => correctSet.has(token)).length * 7;
}

// Language-agnostic distractor scorer for the MEANING side. The signals
// (pos / length / token-count / frequency / abstract-pos / comma / overlap)
// are all language-neutral; only WHICH translation the candidate exposes
// depends on `meaningLocale`. `scoreMalayDistractor` is retained as a thin
// alias hardcoding "ms" so existing call sites keep byte-identical behavior.
export function scoreMeaningDistractor(
  correctWord: Word,
  candidate: FahamMcqPoolWord,
  meaningLocale: FahamMeaningLocale,
): number {
  const correctMeaning = normalizeMeaning(wordMeaning(correctWord, meaningLocale));
  const candidateMeaning = normalizeMeaning(poolWordMeaning(candidate, meaningLocale));
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
    (!isAbstractPos(correctWord.pos) && isAbstractPos(candidate.pos) ? -14 : 0) +
    (correctMeaning.includes(",") === candidateMeaning.includes(",") ? 3 : 0) -
    meaningOverlapPenalty(correctMeaning, candidateMeaning)
  );
}

/** @deprecated Use {@link scoreMeaningDistractor}. Thin alias hardcoding "ms". */
export function scoreMalayDistractor(correctWord: Word, candidate: FahamMcqPoolWord): number {
  return scoreMeaningDistractor(correctWord, candidate, "ms");
}

export function scoreArabicDistractor(
  correctWord: Word,
  candidate: FahamMcqPoolWord,
  meaningLocale: FahamMeaningLocale = "ms",
): number {
  const correctArabic = normalizeArabicText(correctWord.text_uthmani);
  const candidateArabic = normalizeArabicText(candidate.textUthmani);
  if (!correctArabic || !candidateArabic) {
    return Number.NEGATIVE_INFINITY;
  }

  const correctMeaning = normalizeMeaning(wordMeaning(correctWord, meaningLocale));
  const candidateMeaning = normalizeMeaning(poolWordMeaning(candidate, meaningLocale));
  const sameRoot = Boolean(correctWord.root && candidate.root && correctWord.root === candidate.root);
  const sameLemma = Boolean(
    correctWord.lemma && candidate.lemma && correctWord.lemma === candidate.lemma,
  );

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
    (sameRoot ? -22 : 0) +
    (sameLemma ? -10 : 0) +
    (correctMeaning && candidateMeaning
      ? proximityScore(correctMeaning.length, candidateMeaning.length, 8, 2)
      : 0)
  );
}

export function buildWhyThisSetNotes(word: Word, direction: FahamMcqDirection): string[] {
  const notes: string[] = [];

  if (word.pos) {
    notes.push(`Pilihan diutamakan daripada kelas kata ${word.pos} yang serupa.`);
  }

  if (direction === "arab_to_bm") {
    notes.push("Makna dipilih hampir sama panjang supaya jawapan tidak terlalu menonjol.");
    if (!isAbstractPos(word.pos)) {
      notes.push("Partikel dan kata fungsi ditolak ke bawah supaya gangguan lebih bermakna.");
    }
    return notes;
  }

  notes.push("Pilihan Arab dipilih dengan rupa panjang yang hampir seimbang.");
  if (word.root || word.lemma) {
    notes.push("Keluarga akar yang sama dielakkan supaya soalan benar-benar uji makna.");
  }

  return notes;
}

export function selectDistractors(params: {
  correctWord: Word;
  count: number;
  pool: FahamMcqPoolWord[];
  scoreCandidate: (correctWord: Word, candidate: FahamMcqPoolWord) => number;
  toChoiceValue: (candidate: FahamMcqPoolWord) => string | null;
  // B2 fix: the correct answer's own display value. A candidate whose
  // display value matches this (case/whitespace-normalized) must never be
  // offered as a distractor, even when it has a different `id` — otherwise
  // the correct answer's text can appear twice among the options (once as
  // the answer, once disguised as a "wrong" choice).
  correctChoiceValue: string;
}): string[] {
  const { correctWord, count, pool, scoreCandidate, toChoiceValue, correctChoiceValue } = params;
  const normalizedCorrect = normalizeChoiceValue(correctChoiceValue);
  // Seed `seen` with the correct value so it can never be re-added as a
  // "distractor" duplicate, and so all dedup below compares on the same
  // normalized key (display value, not id).
  const seen = new Set<string>([normalizedCorrect]);
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
      return (
        candidate !== null &&
        Number.isFinite(candidate.score) &&
        normalizeChoiceValue(candidate.choiceValue) !== normalizedCorrect
      );
    })
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.choiceValue.localeCompare(right.choiceValue);
    });

  const deduped: string[] = [];
  for (const candidate of ranked) {
    const key = normalizeChoiceValue(candidate.choiceValue);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(candidate.choiceValue);
  }

  return deduped.slice(0, Math.max(count * 6, count));
}
