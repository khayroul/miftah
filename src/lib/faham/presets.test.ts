import assert from "node:assert/strict";
import test from "node:test";
import {
  FAHAM_PRESET_CONFIGS,
  parseFahamSourcePreset,
} from "./presets";

test("parseFahamSourcePreset falls back to mixed for unknown values", () => {
  assert.equal(parseFahamSourcePreset(undefined), "mixed");
  assert.equal(parseFahamSourcePreset(null), "mixed");
  assert.equal(parseFahamSourcePreset("unknown"), "mixed");
});

test("parseFahamSourcePreset preserves supported presets", () => {
  assert.equal(parseFahamSourcePreset("reading"), "reading");
  assert.equal(parseFahamSourcePreset("theme"), "theme");
  assert.equal(parseFahamSourcePreset("hifz"), "hifz");
});

test("theme preset keeps theme chunks first", () => {
  assert.deepEqual(FAHAM_PRESET_CONFIGS.theme.preferredSources, [
    "theme_chunk",
    "reading_page",
    "hifz_ayah",
  ]);
});
