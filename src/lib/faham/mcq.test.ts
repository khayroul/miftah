import assert from "node:assert/strict";
import test from "node:test";
import type { Word } from "@/types/database";
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
    frequency: 150,
    id: 100,
    pos: "noun",
    textSimple: "الهدى",
    textUthmani: "الْهُدَى",
    translationBm: "petunjuk",
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
  assert.ok(mcq?.options.some((option) => option.value === "hamba"));
  assert.ok(mcq?.options.some((option) => option.value === "rahmat"));
  assert.ok(!mcq?.options.some((option) => option.value === "benar-benar"));
});

test("bm_to_arab returns Arabic options and Malay prompt", () => {
  const word = buildWord({ translation_bm: "petunjuk" });
  const pool = [
    buildPoolWord({ id: 2, textUthmani: "النُّور", translationBm: "cahaya" }),
    buildPoolWord({ id: 3, textUthmani: "الرَّحْمَة", translationBm: "rahmat" }),
    buildPoolWord({ id: 4, textUthmani: "الْعِلْم", translationBm: "ilmu" }),
  ];

  const mcq = buildFahamMcqForWord(word, pool, "bm_to_arab");

  assert.ok(mcq);
  assert.equal(mcq?.direction, "bm_to_arab");
  assert.equal(mcq?.promptPrimary, "petunjuk");
  assert.equal(mcq?.options[mcq.correctIndex].value, "الْكِتَاب");
  assert.ok(mcq?.options.every((option) => option.lang === "ar"));
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
