import assert from "node:assert/strict";
import test from "node:test";
import { loadHifzTasmiText } from "./tasmiText";

test("loadHifzTasmiText builds ordered text and per-ayah word ranges", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        ayahs: [
          { id: 1, surahId: 2, ayahNumber: 1, textSimple: "satu dua" },
          { id: 2, surahId: 2, ayahNumber: 2, textSimple: "tiga empat lima" },
        ],
      }),
      { status: 200 },
    );

  try {
    const result = await loadHifzTasmiText([1, 2]);
    assert.deepEqual(result, {
      ayahRanges: [
        { surah: 2, ayah: 1, startWordIndex: 0, endWordIndex: 1 },
        { surah: 2, ayah: 2, startWordIndex: 2, endWordIndex: 4 },
      ],
      endAyah: 2,
      expectedText: "satu dua tiga empat lima",
      startAyah: 1,
      surahNumber: 2,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("loadHifzTasmiText returns null when the API rejects the request", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(null, { status: 401 });
  try {
    assert.equal(await loadHifzTasmiText([1]), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
