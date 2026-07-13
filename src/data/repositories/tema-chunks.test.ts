import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Theme } from "@/shared/types/database";
import {
  buildChunksFromAyahThemeDataset,
  selectDominantTheme,
} from "./tema-chunks";
import { normalizeSurahOverrides } from "./tema-overrides";
import type { ThemeAppearanceAyah } from "./tema-types";

function theme(id: number): Theme {
  return {
    id,
    name_bm: `Tema ${id}`,
    name_en: `Theme ${id}`,
    category: "aqidah",
    description_bm: null,
    description_en: null,
    parent_id: null,
  };
}

function ayah(ayahNumber: number): ThemeAppearanceAyah {
  return {
    id: ayahNumber,
    surah_id: 2,
    ayah_number: ayahNumber,
    text_uthmani: `ayah-${ayahNumber}`,
    display_bm: null,
    page_number: 2,
    theme: null,
    theme_relevance: null,
  };
}

describe("Tema row and chunk mapping", () => {
  it("selects primary relevance first, then the lowest theme id", () => {
    const selected = selectDominantTheme([
      { ayah_id: 1, relevance: "secondary", theme: theme(1) },
      { ayah_id: 1, relevance: "primary", theme: [theme(8)] },
      { ayah_id: 1, relevance: "primary", theme: theme(3) },
    ]);

    assert.equal(selected.theme?.id, 3);
    assert.equal(selected.relevance, "primary");
  });

  it("preserves unthemed gaps and applies exact-range override labels", () => {
    const chunks = buildChunksFromAyahThemeDataset(
      [1, 2, 3, 4, 5].map(ayah),
      [
        {
          id: 20,
          surah_id: 2,
          ayah_from: 2,
          ayah_to: 3,
          theme: "Faith",
          theme_bm: "Iman",
        },
      ],
      [
        {
          start_ayah: 2,
          end_ayah: 3,
          theme_id: null,
          label_bm: "Label pilihan",
          label_en: null,
          synopsis_bm: "Ringkasan",
        },
      ],
    );

    assert.deepEqual(
      chunks.map((chunk) => ({
        index: chunk.chunk_index,
        start: chunk.start_ayah,
        end: chunk.end_ayah,
        labelBm: chunk.label_bm,
        labelEn: chunk.label_en,
        synopsisBm: chunk.synopsis_bm,
      })),
      [
        { index: 1, start: 1, end: 1, labelBm: null, labelEn: null, synopsisBm: null },
        { index: 2, start: 2, end: 3, labelBm: "Label pilihan", labelEn: "Faith", synopsisBm: "Ringkasan" },
        { index: 3, start: 4, end: 5, labelBm: null, labelEn: null, synopsisBm: null },
      ],
    );
  });

  it("normalizes, bounds, sorts, and drops overlapping overrides", () => {
    const overrides = normalizeSurahOverrides(
      [
        { start_ayah: 4, end_ayah: 20, label_bm: "  Akhir  " },
        { start_ayah: 2, end_ayah: 5, label_bm: "Overlap" },
        { start_ayah: "1", end_ayah: "3", theme_id: "7" },
        { start_ayah: 99, end_ayah: 100 },
      ],
      10,
    );

    assert.deepEqual(overrides, [
      {
        start_ayah: 1,
        end_ayah: 3,
        theme_id: 7,
        label_bm: null,
        label_en: null,
        synopsis_bm: null,
      },
      {
        start_ayah: 4,
        end_ayah: 10,
        theme_id: null,
        label_bm: "Akhir",
        label_en: null,
        synopsis_bm: null,
      },
    ]);
  });
});
