import assert from "node:assert/strict";
import test from "node:test";
import type { Word } from "@/shared/types/database";
import {
  buildFahamMcqForWord,
  normalizeMalayMeaning,
  type FahamMcqPoolWord,
} from "./mcq";

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
    pos: "noun",
    frequency: 120,
    ...overrides,
  };
}

function buildPoolWord(overrides: Partial<FahamMcqPoolWord> = {}): FahamMcqPoolWord {
  return {
    audioKey: null,
    frequency: 150,
    id: 100,
    lemma: "هدى",
    pos: "noun",
    root: "هدي",
    textSimple: "الهدى",
    textUthmani: "الْهُدَى",
    translationBm: "petunjuk",
    translationEn: null,
    transliteration: "al-huda",
    ...overrides,
  };
}

test("normalizeMalayMeaning trims and collapses whitespace", () => {
  assert.equal(normalizeMalayMeaning("  kitab   yang   jelas "), "kitab yang jelas");
  assert.equal(normalizeMalayMeaning("   "), null);
});

test("arab_to_bm prefers same-pos and similar-length Malay distractors", () => {
  const word = buildWord();
  const pool = [
    buildPoolWord({ id: 2, translationBm: "petunjuk", frequency: 130 }),
    buildPoolWord({ id: 3, translationBm: "rahmat", frequency: 90 }),
    buildPoolWord({ id: 4, translationBm: "hari pembalasan", pos: "noun", frequency: 500 }),
    buildPoolWord({ id: 5, translationBm: "benar-benar", pos: "particle", frequency: 125 }),
    buildPoolWord({ id: 6, translationBm: "hamba", frequency: 140 }),
  ];

  const mcq = buildFahamMcqForWord(word, pool, "arab_to_bm");

  assert.ok(mcq);
  assert.equal(mcq?.direction, "arab_to_bm");
  assert.equal(mcq?.options[mcq.correctIndex].value, "kitab");
  assert.ok(
    mcq?.options.some((option) => option.value === "hamba") ||
      mcq?.options.some((option) => option.value === "rahmat"),
  );
  assert.ok(!mcq?.options.some((option) => option.value === "benar-benar"));
});

test("bm_to_arab returns Arabic options and Malay prompt", () => {
  const word = buildWord({ root: "كتب", lemma: "كتاب", translation_bm: "petunjuk" });
  const pool = [
    buildPoolWord({ id: 2, root: "نور", lemma: "نور", textUthmani: "النُّور", translationBm: "cahaya" }),
    buildPoolWord({ id: 3, root: "رحم", lemma: "رحمة", textUthmani: "الرَّحْمَة", translationBm: "rahmat" }),
    buildPoolWord({ id: 4, root: "علم", lemma: "علم", textUthmani: "الْعِلْم", translationBm: "ilmu" }),
  ];

  const mcq = buildFahamMcqForWord(word, pool, "bm_to_arab");

  assert.ok(mcq);
  assert.equal(mcq?.direction, "bm_to_arab");
  assert.equal(mcq?.promptPrimary, "petunjuk");
  assert.equal(mcq?.options[mcq.correctIndex].value, "الْكِتَاب");
  assert.ok(mcq?.options.every((option) => option.lang === "ar"));
  assert.ok(
    mcq?.whyThisSet.some((note) => note.includes("akar")),
  );
});

test("mixed mode deterministically chooses one valid direction", () => {
  const word = buildWord({ id: 22, translation_bm: "jalan yang lurus" });
  const pool = [
    buildPoolWord({ id: 2, textUthmani: "النُّور", translationBm: "cahaya" }),
    buildPoolWord({ id: 3, textUthmani: "الرَّحْمَة", translationBm: "rahmat" }),
    buildPoolWord({ id: 4, textUthmani: "الْعِلْم", translationBm: "ilmu" }),
    buildPoolWord({ id: 5, textUthmani: "الْحَقّ", translationBm: "kebenaran" }),
  ];

  const first = buildFahamMcqForWord(word, pool, "mixed");
  const second = buildFahamMcqForWord(word, pool, "mixed");

  assert.ok(first);
  assert.deepEqual(first, second);
  assert.ok(first?.direction === "arab_to_bm" || first?.direction === "bm_to_arab");
});

// --- RF-3: B2 / B3 / B8 integrity fixes -------------------------------

test("B2: a distractor sharing the correct meaning (different id, case/whitespace variant) is never offered", () => {
  // word: translation_bm "kitab", frequency 120, pos "noun"
  const word = buildWord();
  const pool = [
    // Trap: different id, but the SAME display meaning as the correct answer
    // (case + whitespace variant), engineered (same pos/length/frequency as
    // the correct word) to score far ABOVE every filler below — so if the
    // implementation only excludes by id, this candidate is guaranteed to
    // win a distractor slot instead of merely "maybe" winning one.
    buildPoolWord({ id: 7, translationBm: " Kitab ", frequency: 120, pos: "noun" }),
    // Fillers: deliberately low-scoring (mismatched pos + far length/frequency)
    // so they never outrank the trap — exactly 3 of them so, once the trap is
    // correctly excluded, they alone satisfy distractorCount (3) and the MCQ
    // still builds successfully post-fix.
    buildPoolWord({
      id: 2,
      translationBm: "hari pembalasan yang amat dahsat sungguh",
      pos: "particle",
      frequency: 500,
    }),
    buildPoolWord({
      id: 3,
      translationBm: "rahmat kurniaan yang melimpah ruah semua",
      pos: "particle",
      frequency: 510,
    }),
    buildPoolWord({
      id: 6,
      translationBm: "hamba yang taat kepada penciptanya setiap",
      pos: "particle",
      frequency: 520,
    }),
  ];

  const mcq = buildFahamMcqForWord(word, pool, "arab_to_bm");

  assert.ok(mcq);
  const normalizedValues = mcq!.options.map((option) => option.value.trim().toLowerCase());
  const correctOccurrences = normalizedValues.filter((value) => value === "kitab");
  assert.equal(correctOccurrences.length, 1, "correct value must appear exactly once among options");
  assert.equal(mcq!.options[mcq!.correctIndex].value, "kitab");
});

test("B2: a distractor sharing the correct Arabic text (different id, whitespace variant) is never offered", () => {
  const word = buildWord({ root: "كتب", lemma: "كتاب", translation_bm: "petunjuk", pos: "noun" });
  const correctArabic = word.text_uthmani;
  const pool = [
    // Trap: different id, same displayed Arabic text as the correct answer
    // (whitespace variant), engineered (different root/lemma so it isn't
    // root/lemma-penalized, same pos/length/frequency as correct) to score
    // far ABOVE every filler below — guaranteed to win a slot if the
    // implementation only excludes by id.
    buildPoolWord({
      id: 9,
      textUthmani: `  ${correctArabic}  `,
      translationBm: "ilmu",
      root: "دين",
      lemma: "دين",
      frequency: 120,
      pos: "noun",
    }),
    // Fillers: deliberately low-scoring (mismatched pos + far length/frequency).
    buildPoolWord({
      id: 2,
      textUthmani: "الرَّحْمَٰنِ الرَّحِيمِ الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ",
      translationBm: "cahaya",
      root: "رحم",
      lemma: "رحمن",
      pos: "particle",
      frequency: 900,
    }),
    buildPoolWord({
      id: 3,
      textUthmani: "مَالِكِ يَوْمِ الدِّينِ إِيَّاكَ نَعْبُدُ وَإِيَّاكَ نَسْتَعِينُ",
      translationBm: "rahmat",
      root: "ملك",
      lemma: "مالك",
      pos: "particle",
      frequency: 910,
    }),
    buildPoolWord({
      id: 4,
      textUthmani: "اهدِنَا الصِّرَاطَ المُستَقِيمَ صِرَاطَ الَّذِينَ أَنعَمتَ عَلَيهِم",
      translationBm: "cara",
      root: "هدي",
      lemma: "هدى",
      pos: "particle",
      frequency: 920,
    }),
  ];

  const mcq = buildFahamMcqForWord(word, pool, "bm_to_arab");

  assert.ok(mcq);
  const values = mcq!.options.map((option) => option.value.trim());
  const correctOccurrences = values.filter((value) => value === correctArabic);
  assert.equal(correctOccurrences.length, 1, "correct Arabic value must appear exactly once among options");
  assert.equal(mcq!.options[mcq!.correctIndex].value, correctArabic);
});

test("B3: a different attemptSeed reshuffles option order for the same word", () => {
  const word = buildWord({ id: 55, translation_bm: "kitab" });
  const pool = [
    buildPoolWord({ id: 2, translationBm: "petunjuk", frequency: 130 }),
    buildPoolWord({ id: 3, translationBm: "rahmat", frequency: 90 }),
    buildPoolWord({ id: 6, translationBm: "hamba", frequency: 140 }),
    buildPoolWord({ id: 8, translationBm: "cahaya", frequency: 145 }),
    buildPoolWord({ id: 9, translationBm: "ilmu", frequency: 128 }),
  ];

  const orders = new Set<string>();
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const mcq = buildFahamMcqForWord(word, pool, "arab_to_bm", 4, attempt);
    assert.ok(mcq);
    orders.add(mcq!.options.map((option) => option.value).join("|"));
  }

  assert.ok(orders.size > 1, "expected option order to vary across attemptSeeds, but it never changed");
});

test("B3: correctIndex always points at the correct value regardless of attemptSeed", () => {
  const word = buildWord({ id: 55, translation_bm: "kitab" });
  const pool = [
    buildPoolWord({ id: 2, translationBm: "petunjuk", frequency: 130 }),
    buildPoolWord({ id: 3, translationBm: "rahmat", frequency: 90 }),
    buildPoolWord({ id: 6, translationBm: "hamba", frequency: 140 }),
    buildPoolWord({ id: 8, translationBm: "cahaya", frequency: 145 }),
    buildPoolWord({ id: 9, translationBm: "ilmu", frequency: 128 }),
  ];

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const mcq = buildFahamMcqForWord(word, pool, "arab_to_bm", 4, attempt);
    assert.ok(mcq, `expected a built mcq for attempt ${attempt}`);
    assert.equal(mcq!.options[mcq!.correctIndex].value, "kitab");
  }
});

test("B3: same word + same attemptSeed stays stable within one render", () => {
  const word = buildWord({ id: 55, translation_bm: "kitab" });
  const pool = [
    buildPoolWord({ id: 2, translationBm: "petunjuk", frequency: 130 }),
    buildPoolWord({ id: 3, translationBm: "rahmat", frequency: 90 }),
    buildPoolWord({ id: 6, translationBm: "hamba", frequency: 140 }),
    buildPoolWord({ id: 8, translationBm: "cahaya", frequency: 145 }),
    buildPoolWord({ id: 9, translationBm: "ilmu", frequency: 128 }),
  ];

  const first = buildFahamMcqForWord(word, pool, "arab_to_bm", 4, "attempt-7");
  const second = buildFahamMcqForWord(word, pool, "arab_to_bm", 4, "attempt-7");

  assert.ok(first);
  assert.deepEqual(first, second);
});

test("B8: mixed direction alternates across attemptSeed instead of pinning forever", () => {
  const word = buildWord({ id: 22, translation_bm: "jalan yang lurus" });
  // Distinct textUthmani per pool word (not the shared buildPoolWord default)
  // so BOTH directions (arab_to_bm and bm_to_arab) can actually build — a
  // pool with colliding Arabic text would make one direction structurally
  // unbuildable regardless of seed, masking the alternation this test checks.
  const pool = [
    buildPoolWord({ id: 2, textUthmani: "النُّور", translationBm: "cahaya" }),
    buildPoolWord({ id: 3, textUthmani: "الرَّحْمَة", translationBm: "rahmat" }),
    buildPoolWord({ id: 4, textUthmani: "الْعِلْم", translationBm: "ilmu" }),
    buildPoolWord({ id: 5, textUthmani: "الْحَقّ", translationBm: "kebenaran" }),
  ];

  const directions = new Set<string>();
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const mcq = buildFahamMcqForWord(word, pool, "mixed", 4, attempt);
    assert.ok(mcq, `expected a built mcq for attempt ${attempt}`);
    directions.add(mcq!.direction);
  }

  assert.equal(directions.size, 2, "expected both directions to appear across repeated attempts");
});

// --- meaningLocale="en": full English answer options -----------------------

// A fixed fixture shared by the meaningLocale tests below. buildWord's default
// already carries translation_en "book".
function englishFixture() {
  const word = buildWord({ id: 55, translation_bm: "kitab", translation_en: "book" });
  // Distinct textUthmani/root/lemma per pool word so BOTH directions can build
  // (bm_to_arab needs distinct Arabic distractors). The arab_to_bm output —
  // and the MS golden below — is independent of these Arabic fields, which
  // only feed the bm_to_arab (scoreArabicDistractor) path.
  const pool = [
    buildPoolWord({ id: 2, translationBm: "petunjuk", translationEn: "guidance", frequency: 130, textUthmani: "النُّور", root: "نور", lemma: "نور" }),
    buildPoolWord({ id: 3, translationBm: "rahmat", translationEn: "mercy", frequency: 90, textUthmani: "الرَّحْمَة", root: "رحم", lemma: "رحمة" }),
    buildPoolWord({ id: 6, translationBm: "hamba", translationEn: "servant", frequency: 140, textUthmani: "الْعَبْد", root: "عبد", lemma: "عبد" }),
    buildPoolWord({ id: 8, translationBm: "cahaya", translationEn: "light", frequency: 145, textUthmani: "الضِّيَاء", root: "ضوأ", lemma: "ضياء" }),
    buildPoolWord({ id: 9, translationBm: "ilmu", translationEn: "knowledge", frequency: 128, textUthmani: "الْعِلْم", root: "علم", lemma: "علم" }),
  ];
  return { word, pool };
}

test("EN mode: arab_to_bm options are built from translationEn with lang 'en'", () => {
  const { word, pool } = englishFixture();
  const mcq = buildFahamMcqForWord(word, pool, "arab_to_bm", 4, 7, "en");

  assert.ok(mcq);
  assert.equal(mcq!.direction, "arab_to_bm");
  // Every option renders as English, never Malay.
  assert.ok(mcq!.options.every((option) => option.lang === "en"));
  // The correct option is the English meaning; the Malay meaning is the gloss.
  assert.equal(mcq!.options[mcq!.correctIndex].value, "book");
  assert.equal(mcq!.answerPrimary, "book");
  assert.equal(mcq!.answerSecondary, "kitab");
  // The distractor VALUES come from the pool's English translations, not Malay.
  const values = mcq!.options.map((option) => option.value);
  assert.ok(values.every((value) => !["petunjuk", "rahmat", "hamba", "cahaya", "ilmu", "kitab"].includes(value)));
  // No English guide voice exists → answer audio degrades to null.
  assert.equal(mcq!.answerAudioUrl, null);
});

test("EN mode: bm_to_arab prompt is the English meaning with no prompt audio", () => {
  const { word, pool } = englishFixture();
  const mcq = buildFahamMcqForWord(word, pool, "bm_to_arab", 4, 7, "en");

  assert.ok(mcq);
  assert.equal(mcq!.direction, "bm_to_arab");
  assert.equal(mcq!.promptLang, "en");
  assert.equal(mcq!.promptPrimary, "book");
  assert.equal(mcq!.promptSecondary, "kitab");
  // Prompt is an English meaning → Malay TTS is not synthesized.
  assert.equal(mcq!.promptAudioUrl, null);
  // Arabic options are unaffected by meaningLocale.
  assert.ok(mcq!.options.every((option) => option.lang === "ar"));
});

test("EN mode: same inputs produce byte-identical MCQs twice (determinism)", () => {
  const { word, pool } = englishFixture();
  const first = buildFahamMcqForWord(word, pool, "arab_to_bm", 4, 7, "en");
  const second = buildFahamMcqForWord(word, pool, "arab_to_bm", 4, 7, "en");

  assert.ok(first);
  assert.deepEqual(first, second);
});

test("EN mode: drop-rule fires when the selected (English) translation is missing", () => {
  const { pool } = englishFixture();
  // A word with a Malay meaning but NO English meaning must not build in EN
  // mode (symmetric drop-guard), even though it would build fine in MS mode.
  const word = buildWord({ id: 55, translation_bm: "kitab", translation_en: null });

  assert.equal(buildFahamMcqForWord(word, pool, "arab_to_bm", 4, 7, "en"), null);
  assert.ok(buildFahamMcqForWord(word, pool, "arab_to_bm", 4, 7, "ms"));
});

test("EN and MS orderings are independent (different option sets/seeds)", () => {
  const { word, pool } = englishFixture();
  const ms = buildFahamMcqForWord(word, pool, "arab_to_bm", 4, 7, "ms");
  const en = buildFahamMcqForWord(word, pool, "arab_to_bm", 4, 7, "en");

  assert.ok(ms);
  assert.ok(en);
  assert.ok(ms!.options.every((option) => option.lang === "ms"));
  assert.ok(en!.options.every((option) => option.lang === "en"));
});

// --- MS-mode regression guard (the critical assertion) ----------------------

test("MS mode output is byte-identical to the pinned pre-change golden", () => {
  const { word, pool } = englishFixture();
  const ms = buildFahamMcqForWord(word, pool, "arab_to_bm", 4, 7, "ms");

  // Golden captured from the builder for this exact fixture. Any future change
  // that perturbs MS-mode option ordering, seed, lang, or answer audio breaks
  // this — the guard the meaningLocale generalization must never regress.
  assert.deepEqual(ms, {
    answerLabel: "Makna BM",
    answerPrimary: "kitab",
    answerSecondary: "book",
    correctIndex: 2,
    direction: "arab_to_bm",
    options: [
      { dir: "ltr", lang: "ms", value: "ilmu" },
      { dir: "ltr", lang: "ms", value: "hamba" },
      { dir: "ltr", lang: "ms", value: "kitab" },
      { dir: "ltr", lang: "ms", value: "cahaya" },
    ],
    promptAudioUrl: null,
    promptDir: "rtl",
    promptHint: "Pilih makna BM yang tepat.",
    promptLabel: "Perkataan Arab",
    promptLang: "ar",
    promptPrimary: "الْكِتَاب",
    promptSecondary: "al-kitab",
    answerAudioUrl: "/api/audio/tts?text=kitab&lang=ms&voice=male&v=2",
    whyThisSet: [
      "Pilihan diutamakan daripada kelas kata noun yang serupa.",
      "Makna dipilih hampir sama panjang supaya jawapan tidak terlalu menonjol.",
      "Partikel dan kata fungsi ditolak ke bawah supaya gangguan lebih bermakna.",
    ],
  });
});

test("MS mode is the default meaningLocale (omitted arg === explicit 'ms')", () => {
  const { word, pool } = englishFixture();
  const explicit = buildFahamMcqForWord(word, pool, "arab_to_bm", 4, 7, "ms");
  const defaulted = buildFahamMcqForWord(word, pool, "arab_to_bm", 4, 7);

  assert.ok(explicit);
  assert.deepEqual(defaulted, explicit);
});
