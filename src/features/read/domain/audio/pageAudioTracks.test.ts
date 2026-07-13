import test from "node:test";
import assert from "node:assert/strict";
import { mapAyatToPageAudioTracks } from "./pageAudioTracks";

test("mapAyatToPageAudioTracks preserves explicit audio_url", () => {
  const tracks = mapAyatToPageAudioTracks([
    {
      id: 1,
      surah_id: 2,
      ayah_number: 1,
      text_uthmani: "",
      text_simple: "",
      translation_id: null,
      translation_en: null,
      display_bm: "A",
      bm_flagged: false,
      bm_resolution_notes: null,
      bm_correction_note: null,
      page_number: 2,
      juz_number: 1,
      hizb_number: null,
      ruku_number: null,
      sajdah: false,
      word_count: 4,
      audio_url: "https://example.com/2_001.mp3",
    },
  ]);

  assert.equal(tracks.length, 1);
  assert.equal(tracks[0]?.key, "2:1");
  assert.equal(tracks[0]?.audioUrl, "https://example.com/2_001.mp3");
});

test("mapAyatToPageAudioTracks falls back to EveryAyah URL", () => {
  const tracks = mapAyatToPageAudioTracks([
    {
      id: 2,
      surah_id: 2,
      ayah_number: 2,
      text_uthmani: "",
      text_simple: "",
      translation_id: null,
      translation_en: null,
      display_bm: "B",
      bm_flagged: false,
      bm_resolution_notes: null,
      bm_correction_note: null,
      page_number: 2,
      juz_number: 1,
      hizb_number: null,
      ruku_number: null,
      sajdah: false,
      word_count: 4,
      audio_url: null,
    },
  ]);

  assert.equal(tracks.length, 1);
  assert.equal(tracks[0]?.key, "2:2");
  assert.equal(
    tracks[0]?.audioUrl,
    "https://everyayah.com/data/Alafasy_128kbps/002002.mp3",
  );
});
