import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveThemeChunkLabelBm,
  resolveThemeChunkLabelEn,
} from "./themeLabels";

test("uses a concise curated English theme label", () => {
  assert.equal(
    resolveThemeChunkLabelEn({
      surahId: 1,
      startAyah: 1,
      endAyah: 7,
      labelEn: "Supplication to Allah for guidance taught by Allah Himself",
    }),
    "A prayer for guidance",
  );
});

test("rejects placeholder English theme labels", () => {
  assert.equal(
    resolveThemeChunkLabelEn({
      surahId: 2,
      startAyah: 1,
      endAyah: 5,
      labelEn: "Unthemed",
    }),
    null,
  );
});

test("keeps the Bahasa Malaysia fallback range", () => {
  assert.equal(
    resolveThemeChunkLabelBm({
      surahId: 2,
      startAyah: 1,
      endAyah: 5,
    }),
    "Fokus ayat 2:1-5",
  );
});
