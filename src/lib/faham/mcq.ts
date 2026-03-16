import type { Word } from "@/types/database";
import type { WordWithOccurrences } from "./types";
import { getQuranWordAudioUrl } from "../mushafAssets";

function getDirectAudioKey(word: WordWithOccurrences): string | null {
  const occs = word.word_occurrences;
  const occ = Array.isArray(occs) ? occs[0] : occs;
  if (!occ) return null;
  const ayahValue = (occ as { ayat?: unknown; ayats?: unknown }).ayat
    ?? (occ as { ayat?: unknown; ayats?: unknown }).ayats;
  const ayah = Array.isArray(ayahValue) ? ayahValue[0] : ayahValue;
  if (!ayah) return null;
  const normalizedAyah = ayah as { surah_id?: number; ayah_number?: number };
  if (!normalizedAyah.surah_id || !normalizedAyah.ayah_number) return null;
  return `${normalizedAyah.surah_id}:${normalizedAyah.ayah_number}:${occ.position}`;
}

function normalizeArabicAudioLookup(value: string | null | undefined): string {
  if (!value) {
    return "";
  }

  return value
    .normalize("NFKD")
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, "")
    .replace(/ٱ/g, "ا")
    .replace(/ـ/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getFallbackAudioKey(
  word: WordWithOccurrences,
  pool: FahamMcqPoolWord[],
): string | null {
  const normalizedSimple = word.text_simple.trim();
  if (normalizedSimple.length > 0) {
    const bySimple = pool.find(
      (candidate) =>
        candidate.audioKey &&
        candidate.textSimple.trim() === normalizedSimple,
    );
    if (bySimple?.audioKey) {
      return bySimple.audioKey;
    }
  }

  const normalizedArabic = normalizeArabicAudioLookup(word.text_uthmani);
  if (!normalizedArabic) {
    return null;
  }

  const byUthmani = pool.find(
    (candidate) =>
      candidate.audioKey &&
      normalizeArabicAudioLookup(candidate.textUthmani) === normalizedArabic,
  );
  return byUthmani?.audioKey ?? null;
}

function getAudioKey(
  word: WordWithOccurrences,
  pool: FahamMcqPoolWord[],
): string | null {
  return getDirectAudioKey(word) ?? getFallbackAudioKey(word, pool);
}

function getAudioUrlForKey(key: string | null): string | null {
  if (!key) return null;
  const parts = key.split(":").map(Number);
  if (parts.length !== 3) return null;
  return getQuranWordAudioUrl(parts[0], parts[1], parts[2]);
}

function getMalayAudioUrl(text: string): string {
  // Faham uses a male Malay guide voice to keep prompts sounding consistent.
  // v=2 busts browser cache from prior female Google TTS responses.
  return `/api/audio/tts?text=${encodeURIComponent(text)}&lang=ms&voice=male&v=2`;
}

export type FahamMcqDirection = "arab_to_bm" | "bm_to_arab";
export type FahamMcqDirectionMode = FahamMcqDirection | "mixed";

export interface FahamMcqPoolWord {
  audioKey: string | null;
  frequency: number;
  id: number;
  lemma: string | null;
  pos: string | null;
  root: string | null;
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
  answerAudioUrl: string | null;
  answerLabel: string;
  answerPrimary: string;
  answerSecondary: string | null;
  correctIndex: number;
  direction: FahamMcqDirection;
  options: FahamMcqOption[];
  promptAudioUrl: string | null;
  promptDir: "ltr" | "rtl";
  promptHint: string;
  promptLabel: string;
  promptLang: "ar" | "ms";
  promptPrimary: string;
  promptSecondary: string | null;
  whyThisSet: string[];
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
    (!isAbstractPos(correctWord.pos) && isAbstractPos(candidate.pos) ? -14 : 0) +
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

function buildWhyThisSetNotes(word: Word, direction: FahamMcqDirection): string[] {
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
  word: WordWithOccurrences,
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

  const selectedDistractors = distractors.slice(0, distractorCount);
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
    promptAudioUrl: getAudioUrlForKey(getAudioKey(word, pool)),
    promptDir: "rtl",
    promptHint: "Pilih makna BM paling tepat untuk perkataan Arab ini.",
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

  const selectedDistractors = distractors.slice(0, distractorCount);
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
    promptAudioUrl: getMalayAudioUrl(correctMeaning),
    promptDir: "ltr",
    promptHint: "Pilih perkataan Arab yang paling sepadan dengan makna BM ini.",
    promptLabel: "Makna BM",
    promptLang: "ms",
    promptPrimary: correctMeaning,
    promptSecondary: word.translation_en?.trim() || null,
    answerAudioUrl: getAudioUrlForKey(getAudioKey(word, pool)),
    whyThisSet: buildWhyThisSetNotes(word, "bm_to_arab"),
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
  word: WordWithOccurrences,
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
