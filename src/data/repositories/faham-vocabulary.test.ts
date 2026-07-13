import assert from "node:assert/strict";
import test from "node:test";
import type { Word } from "@/shared/types/database";
import {
  attachFirstOccurrences,
  chunkIds,
  FIRST_OCCURRENCE_PARENT_CHUNK_SIZE,
  firstOccurrencesFromWordRows,
  loadFirstOccurrencesInChunks,
  uniquePositiveIntegerIds,
} from "./faham-vocabulary";

test("deduplicates valid word ids before the occurrence batch", () => {
  assert.deepEqual(
    uniquePositiveIntegerIds([9, 2, 9, 0, -1, 2.5, Number.NaN, 4]),
    [9, 2, 4],
  );
});

test("extracts the aliased first occurrence and ignores missing children", () => {
  const firstByWord = firstOccurrencesFromWordRows([20, 10, 30], [
    {
      first_occurrence: [],
      id: 30,
    },
    {
      first_occurrence: {
        ayah_id: 1,
        ayat: { ayah_number: 1, surah_id: 1 },
        page_number: 1,
        position: 1,
      },
      id: 10,
    },
    {
      first_occurrence: [
        {
          ayah_id: 5,
          ayat: { ayah_number: 5, surah_id: 1 },
          page_number: 2,
          position: 3,
        },
      ],
      id: 20,
    },
  ]);

  assert.deepEqual(firstByWord.get(20), {
    ayah_id: 5,
    ayat: { ayah_number: 5, surah_id: 1 },
    page_number: 2,
    position: 3,
  });
  assert.deepEqual(firstByWord.get(10), {
    ayah_id: 1,
    ayat: { ayah_number: 1, surah_id: 1 },
    page_number: 1,
    position: 1,
  });
  assert.equal(firstByWord.has(30), false);
  assert.equal(firstByWord.size, 2);
  assert.deepEqual([...firstByWord.keys()], [20, 10]);
});

test("chunks more than 1000 parent ids below row and URL limits", () => {
  const ids = Array.from({ length: 1_205 }, (_, index) => index + 1);
  const chunks = chunkIds(ids);
  const conservativeFilterLength = new URLSearchParams({
    id: `in.(${Array.from(
      { length: FIRST_OCCURRENCE_PARENT_CHUNK_SIZE },
      (_, index) => 1_000_000_000 + index,
    ).join(",")})`,
  }).toString().length;

  assert.equal(FIRST_OCCURRENCE_PARENT_CHUNK_SIZE, 200);
  assert.equal(chunks.length, 7);
  assert.ok(chunks.every((chunk) => chunk.length <= 200));
  assert.ok(conservativeFilterLength < 4_000);
  assert.deepEqual(chunks.flat(), ids);
});

test("loads chunks once and merges out-of-order rows in requested order", async () => {
  const requested = Array.from({ length: 1_205 }, (_, index) => index + 1);
  const loadedChunks: number[][] = [];

  const result = await loadFirstOccurrencesInChunks(
    [...requested, 1, 2, 0, -1, 2.5],
    async (chunk) => {
      loadedChunks.push(chunk);
      return [...chunk].reverse().map((id) => ({
        first_occurrence: id % 10 === 0
          ? []
          : [{
              ayah_id: id,
              ayat: { ayah_number: id, surah_id: 1 },
              page_number: 1,
              position: 1,
            }],
        id,
      }));
    },
  );

  assert.equal(loadedChunks.length, 7);
  assert.deepEqual(loadedChunks.flat(), requested);
  assert.equal(result.has(10), false);
  assert.equal(result.get(1)?.ayah_id, 1);
  assert.equal(result.get(1_205)?.ayah_id, 1_205);
  assert.deepEqual(
    [...result.keys()].slice(0, 12),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13],
  );
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
