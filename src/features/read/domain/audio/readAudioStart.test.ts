import test from "node:test";
import assert from "node:assert/strict";
import type { Ayah } from "@/shared/types/database";
import { mapAyatToPageAudioTracks } from "./pageAudioTracks";
import { resolveReadAudioPageStartFromAyah } from "./readAudioStart";

function createAyah(input: {
  id: number;
  surahId: number;
  ayahNumber: number;
  juzNumber: number;
}): Ayah {
  return {
    id: input.id,
    surah_id: input.surahId,
    ayah_number: input.ayahNumber,
    text_simple: "",
    juz_number: input.juzNumber,
    page_number: 1,
    text_uthmani: "",
    translation_id: null,
    translation_en: null,
    display_bm: null,
    bm_flagged: false,
    bm_resolution_notes: null,
    bm_correction_note: null,
    hizb_number: null,
    ruku_number: null,
    sajdah: false,
    word_count: 0,
    audio_url: null,
  };
}

test("resolveReadAudioPageStartFromAyah starts from the tapped ayah to the page end", () => {
  const tracks = mapAyatToPageAudioTracks([
    createAyah({ id: 1, surahId: 1, ayahNumber: 1, juzNumber: 1 }),
    createAyah({ id: 2, surahId: 1, ayahNumber: 2, juzNumber: 1 }),
    createAyah({ id: 3, surahId: 1, ayahNumber: 3, juzNumber: 1 }),
  ]);

  assert.deepEqual(resolveReadAudioPageStartFromAyah(tracks, "1:2"), {
    currentIndex: 1,
    rangeStartIndex: 1,
    rangeEndIndex: 2,
  });
});

test("resolveReadAudioPageStartFromAyah returns null when the ayah is not present", () => {
  const tracks = mapAyatToPageAudioTracks([
    createAyah({ id: 1, surahId: 2, ayahNumber: 255, juzNumber: 3 }),
  ]);

  assert.equal(resolveReadAudioPageStartFromAyah(tracks, "2:256"), null);
});
