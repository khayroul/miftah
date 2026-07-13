import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_TASMI_AYAH_IDS,
  parseTasmiAyahIds,
} from "./tasmiTextRequest";

test("accepts all 32 ayat from the largest seeded Quran page", () => {
  const ayahIds = Array.from({ length: 32 }, (_, index) => index + 1);
  assert.deepEqual(parseTasmiAyahIds({ ayahIds }), ayahIds);
  assert.ok(MAX_TASMI_AYAH_IDS >= 32);
});

test("rejects null and non-object JSON bodies", () => {
  assert.equal(parseTasmiAyahIds(null), null);
  assert.equal(parseTasmiAyahIds([]), null);
  assert.equal(parseTasmiAyahIds("bad"), null);
});

test("rejects invalid, duplicate, empty, and over-cap ayah IDs", () => {
  assert.equal(parseTasmiAyahIds({ ayahIds: [1, 0] }), null);
  assert.equal(parseTasmiAyahIds({ ayahIds: [1, 1] }), null);
  assert.equal(parseTasmiAyahIds({ ayahIds: [] }), null);
  assert.equal(
    parseTasmiAyahIds({
      ayahIds: Array.from({ length: MAX_TASMI_AYAH_IDS + 1 }, (_, i) => i + 1),
    }),
    null,
  );
});
