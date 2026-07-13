import assert from "node:assert/strict";
import test from "node:test";
import { mapExpandedAudioAyatToTracks } from "@/data/repositories/read/audio";

test("maps the lean audio projection without requiring a full ayah row", () => {
  const tracks = mapExpandedAudioAyatToTracks([
    {
      surahId: 2,
      ayahNumber: 1,
      juzNumber: 1,
      audioUrl: "https://example.com/002001.mp3",
      displayBm: "Alif Lam Mim",
    },
  ]);

  assert.deepEqual(tracks, [
    {
      key: "2:1",
      label: "2:1",
      audioUrl: "https://example.com/002001.mp3",
      bm: "Alif Lam Mim",
      surahId: 2,
      ayahNumber: 1,
      juzNumber: 1,
    },
  ]);
});

test("uses the configured EveryAyah fallback when audio_url is absent", () => {
  const tracks = mapExpandedAudioAyatToTracks([
    {
      surahId: 2,
      ayahNumber: 2,
      juzNumber: 1,
      audioUrl: null,
      displayBm: null,
    },
  ]);

  assert.equal(
    tracks[0]?.audioUrl,
    "https://everyayah.com/data/Alafasy_128kbps/002002.mp3",
  );
});
