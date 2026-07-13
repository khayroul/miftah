import assert from "node:assert/strict";
import test from "node:test";
import type { Word } from "@/types/database";
import {
  attachFirstOccurrences,
  indexFirstOccurrences,
  uniquePositiveIntegerIds,
} from "./faham-vocabulary";

test("deduplicates valid word ids before the occurrence batch", () => {
  assert.deepEqual(
    uniquePositiveIntegerIds([9, 2, 9, 0, -1, 2.5, Number.NaN, 4]),
    [9, 2, 4],
  );
});

test("keeps only the first ordered occurrence for each word", () => {
  const firstByWord = indexFirstOccurrences([
    {
      ayah_id: 1,
      ayat: { ayah_number: 1, surah_id: 1 },
      page_number: 1,
      position: 1,
      word_id: 10,
    },
    {
      ayah_id: 2,
      ayat: { ayah_number: 2, surah_id: 1 },
      page_number: 1,
      position: 4,
      word_id: 10,
    },
    {
      ayah_id: 5,
      ayat: { ayah_number: 5, surah_id: 1 },
      page_number: 2,
      position: 3,
      word_id: 20,
    },
  ]);

  assert.deepEqual(firstByWord.get(10), {
    ayah_id: 1,
    ayat: { ayah_number: 1, surah_id: 1 },
    page_number: 1,
    position: 1,
  });
  assert.deepEqual(firstByWord.get(20), {
    ayah_id: 5,
    ayat: { ayah_number: 5, surah_id: 1 },
    page_number: 2,
    position: 3,
  });
  assert.equal(firstByWord.size, 2);
});

test("attaches one occurrence per word without changing word order", () => {
  const words = [
    { id: 20, text_uthmani: "b" },
    { id: 10, text_uthmani: "a" },
  ] as Word[];
  const occurrences = new Map([
    [
      10,
      {
        ayah_id: 1,
        ayat: { ayah_number: 1, surah_id: 1 },
        page_number: 1,
        position: 1,
      },
    ],
  ]);

  const hydrated = attachFirstOccurrences(words, occurrences);

  assert.deepEqual(hydrated.map((word) => word.id), [20, 10]);
  assert.equal(hydrated[0].word_occurrences, null);
  assert.deepEqual(hydrated[1].word_occurrences, occurrences.get(10));
});
