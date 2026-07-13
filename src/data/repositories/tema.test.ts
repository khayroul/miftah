import assert from "node:assert/strict";
import test from "node:test";
import { themeChunkContentKeyFromChunks } from "./tema";

// The bug (RF-5): theme_chunk_progress was keyed by the volatile positional
// chunk_index. These tests pin the fix — progress is keyed by the STABLE content
// triple (surah_id, start_ayah, end_ayah), so it survives a chunk-index shift.

type ChunkStub = {
  chunk_index: number;
  surah_id: number;
  start_ayah: number;
  end_ayah: number;
};

// Surah 2, original chunking. Chunk index 2 covers ayat 6-11.
const V1: ChunkStub[] = [
  { chunk_index: 1, surah_id: 2, start_ayah: 1, end_ayah: 5 },
  { chunk_index: 2, surah_id: 2, start_ayah: 6, end_ayah: 11 },
  { chunk_index: 3, surah_id: 2, start_ayah: 12, end_ayah: 20 },
];

// Same surah after a chunk-definition edit inserts a NEW chunk earlier.
// Every later chunk's positional index shifts by one: the "6-11" span is now at
// index 3, and a NEW span (21-25) appears at index 4.
const V2: ChunkStub[] = [
  { chunk_index: 1, surah_id: 2, start_ayah: 1, end_ayah: 3 },
  { chunk_index: 2, surah_id: 2, start_ayah: 4, end_ayah: 5 },
  { chunk_index: 3, surah_id: 2, start_ayah: 6, end_ayah: 11 },
  { chunk_index: 4, surah_id: 2, start_ayah: 12, end_ayah: 20 },
];

test("RF-5: same content span resolves to the same stable key regardless of chunk_index", () => {
  // In V1 the 6-11 span is chunk 2; in V2 the same span is chunk 3.
  const keyV1 = themeChunkContentKeyFromChunks(V1, 2);
  const keyV2 = themeChunkContentKeyFromChunks(V2, 3);

  assert.deepEqual(keyV1, { surahId: 2, startAyah: 6, endAyah: 11 });
  assert.deepEqual(keyV2, { surahId: 2, startAyah: 6, endAyah: 11 });
  assert.deepEqual(
    keyV1,
    keyV2,
    "progress key must be identical across the index shift",
  );
});

test("RF-5: keying by chunk_index WOULD have re-attributed after the shift (regression witness)", () => {
  // The bug's core: chunk_index 2 pointed at 6-11 in V1, but points at the
  // DIFFERENT span 4-5 in V2. A chunk_index-keyed row would silently move.
  const oldIndexInV1 = themeChunkContentKeyFromChunks(V1, 2);
  const oldIndexInV2 = themeChunkContentKeyFromChunks(V2, 2);

  assert.deepEqual(oldIndexInV1, { surahId: 2, startAyah: 6, endAyah: 11 });
  assert.deepEqual(oldIndexInV2, { surahId: 2, startAyah: 4, endAyah: 5 });
  assert.notDeepEqual(
    oldIndexInV1,
    oldIndexInV2,
    "chunk_index is volatile — proves why the stable content key is required",
  );
});

test("RF-5: an out-of-range chunk index resolves to null", () => {
  assert.equal(themeChunkContentKeyFromChunks(V1, 99), null);
  assert.equal(themeChunkContentKeyFromChunks([], 1), null);
});
