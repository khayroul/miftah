import test from "node:test";
import assert from "node:assert/strict";
import { validatePageTranslations } from "./offlineTranslations";

test("validatePageTranslations accepts valid translation map", () => {
  const input = {
    "1:1:1": { bm: "dengan nama", en: "In (the) name" },
    "1:1:2": { bm: "Allah", en: "(of) Allah" },
  };
  const result = validatePageTranslations(input);
  assert.equal(Object.keys(result).length, 2);
  assert.deepEqual(result["1:1:1"], { location: "1:1:1", bm: "dengan nama", en: "In (the) name" });
  assert.deepEqual(result["1:1:2"], { location: "1:1:2", bm: "Allah", en: "(of) Allah" });
});

test("validatePageTranslations filters entries with non-object values", () => {
  const input = {
    "1:1:1": { bm: "dengan nama", en: "In (the) name" },
    "1:1:2": "invalid string",
    "1:1:3": 42,
    "1:1:4": null,
  };
  const result = validatePageTranslations(input);
  assert.equal(Object.keys(result).length, 1);
  assert.ok(result["1:1:1"]);
});

test("validatePageTranslations filters entries with empty string translations", () => {
  const input = {
    "1:1:1": { bm: "", en: "" },
    "1:1:2": { bm: "Allah", en: "(of) Allah" },
    "1:1:3": { bm: "valid", en: "" },
  };
  const result = validatePageTranslations(input);
  // Both bm and en are empty — filtered out
  assert.ok(!result["1:1:1"], "entry with both empty strings should be filtered");
  // Has at least one non-empty translation — kept
  assert.ok(result["1:1:2"]);
  assert.ok(result["1:1:3"]);
});

test("validatePageTranslations returns empty object for null input", () => {
  const result = validatePageTranslations(null);
  assert.deepEqual(result, {});
});

test("validatePageTranslations returns empty object for undefined input", () => {
  const result = validatePageTranslations(undefined);
  assert.deepEqual(result, {});
});

test("validatePageTranslations returns empty object for non-object input", () => {
  assert.deepEqual(validatePageTranslations("string"), {});
  assert.deepEqual(validatePageTranslations(42), {});
  assert.deepEqual(validatePageTranslations([]), {});
});

test("validatePageTranslations accepts entries with only bm present", () => {
  const input = {
    "1:1:1": { bm: "dengan nama" },
  };
  const result = validatePageTranslations(input);
  assert.ok(result["1:1:1"]);
  assert.equal(result["1:1:1"].bm, "dengan nama");
});

test("validatePageTranslations accepts entries with only en present", () => {
  const input = {
    "1:1:1": { en: "In (the) name" },
  };
  const result = validatePageTranslations(input);
  assert.ok(result["1:1:1"]);
  assert.equal(result["1:1:1"].en, "In (the) name");
});

test("validatePageTranslations returns empty object for empty input object", () => {
  const result = validatePageTranslations({});
  assert.deepEqual(result, {});
});
