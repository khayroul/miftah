import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import * as mushafAssets from "./mushafAssets";
import {
  getAyahImageClientSrc,
  getPageImageClientSrc,
  getQuranWordAudioUrl,
  getRemoteAyahImageUrl,
  getRemotePageImageUrl,
  getRemoteWordImageUrl,
  getWordImageClientSrc,
  loadAyahManifest,
  loadPageManifest,
  resolveAyahImageSource,
  resolvePageImageSource,
  resolveWordImageSource,
} from "./mushafAssets";

const MUSHAF_ENV_KEYS = [
  "MUSHAF_CDN_ENABLED",
  "MUSHAF_AYAT_BASE_URL",
  "MUSHAF_PAGES_BASE_URL",
  "MUSHAF_MANIFESTS_BASE_URL",
  "MUSHAF_WORDS_BASE_URL",
  "MUSHAF_AYAT_BUCKET",
  "MUSHAF_PAGES_BUCKET",
  "MUSHAF_MANIFESTS_BUCKET",
  "MUSHAF_WORDS_BUCKET",
  "NEXT_PUBLIC_SUPABASE_URL",
] as const;

const originalEnv = Object.fromEntries(
  MUSHAF_ENV_KEYS.map((key) => [key, process.env[key]]),
);
const originalFetch = globalThis.fetch;

function setJsonFetch(body: unknown, ok = true): void {
  globalThis.fetch = (async () => ({
    ok,
    json: async () => body,
  })) as typeof fetch;
}

beforeEach(() => {
  for (const key of MUSHAF_ENV_KEYS) delete process.env[key];
  globalThis.fetch = originalFetch;
});

afterEach(() => {
  for (const key of MUSHAF_ENV_KEYS) {
    const value = originalEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  globalThis.fetch = originalFetch;
});

describe("Mushaf asset URL and source resolution", () => {
  it("keeps the facade runtime export surface exact", () => {
    assert.deepEqual(Object.keys(mushafAssets).sort(), [
      "ayahImageExists",
      "getAyahImageClientSrc",
      "getPageImageClientSrc",
      "getQuranWordAudioUrl",
      "getRemoteAyahImageUrl",
      "getRemotePageImageUrl",
      "getRemoteWordImageUrl",
      "getWordImageClientSrc",
      "loadAyahManifest",
      "loadPageManifest",
      "pageImageExists",
      "resolveAyahImagePath",
      "resolveAyahImageSource",
      "resolvePageImagePath",
      "resolvePageImageSource",
      "resolveWordImagePath",
      "resolveWordImageSource",
      "wordImageExists",
    ]);
  });

  it("keeps exact Quran CDN audio and local API fallback formats", () => {
    assert.equal(
      getQuranWordAudioUrl(2, 255, 3),
      "https://audio.qurancdn.com/wbw/002_255_003.mp3",
    );
    assert.equal(getPageImageClientSrc(7), "/api/mushaf/page/7?v=qcfv2");
    assert.equal(
      getPageImageClientSrc(7, "thumb"),
      "/api/mushaf/page/7?variant=thumb&v=qcfv2",
    );
    assert.equal(
      getPageImageClientSrc(7, "mobile"),
      "/api/mushaf/page/7?variant=mobile&v=qcfv2",
    );
    assert.equal(getAyahImageClientSrc(2, 255), "/api/mushaf/ayah/2/255?v=qcfv2");
    assert.equal(getWordImageClientSrc(9), "/api/mushaf/word/9?v=qcfv2");
  });

  it("uses explicit CDN bases, exact filenames, and asset version 4", async () => {
    process.env.MUSHAF_CDN_ENABLED = " yes ";
    process.env.MUSHAF_PAGES_BASE_URL = "https://cdn.example/pages///";
    process.env.MUSHAF_AYAT_BASE_URL = "https://cdn.example/ayat/";
    process.env.MUSHAF_WORDS_BASE_URL = "https://cdn.example/words//";

    assert.equal(
      getRemotePageImageUrl(7),
      "https://cdn.example/pages/page_007.png?v=4",
    );
    assert.equal(
      getRemotePageImageUrl(7, "thumb"),
      "https://cdn.example/pages/page_007_thumb.png?v=4",
    );
    assert.equal(
      getRemotePageImageUrl(7, "mobile"),
      "https://cdn.example/pages/page_007_mobile.webp?v=4",
    );
    assert.equal(
      getRemoteAyahImageUrl(2, 255),
      "https://cdn.example/ayat/ayah_002_255.png?v=4",
    );
    assert.equal(
      getRemoteWordImageUrl(9),
      "https://cdn.example/words/word_00009.png?v=4",
    );
    assert.deepEqual(await resolvePageImageSource(7, "mobile"), {
      kind: "remote",
      url: "https://cdn.example/pages/page_007_mobile.webp?v=4",
    });
    assert.deepEqual(await resolveAyahImageSource(2, 255), {
      kind: "remote",
      url: "https://cdn.example/ayat/ayah_002_255.png?v=4",
    });
    assert.deepEqual(await resolveWordImageSource(987654), {
      kind: "remote",
      url: "https://cdn.example/words/word_987654.png?v=4",
    });
  });

  it("uses Supabase bucket defaults while words remain opt-in", () => {
    process.env.MUSHAF_CDN_ENABLED = "true";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co/";

    assert.equal(
      getRemotePageImageUrl(1),
      "https://project.supabase.co/storage/v1/object/public/mushaf-pages/page_001.png?v=4",
    );
    assert.equal(
      getRemoteAyahImageUrl(1, 1),
      "https://project.supabase.co/storage/v1/object/public/mushaf-ayat/ayah_001_001.png?v=4",
    );
    assert.equal(getRemoteWordImageUrl(1), null);

    process.env.MUSHAF_WORDS_BUCKET = "custom-words";
    assert.equal(
      getRemoteWordImageUrl(1),
      "https://project.supabase.co/storage/v1/object/public/custom-words/word_00001.png?v=4",
    );
  });

  it("rejects invalid ayah and word identifiers without changing page behavior", () => {
    process.env.MUSHAF_CDN_ENABLED = "true";
    process.env.MUSHAF_PAGES_BASE_URL = "https://cdn.example/pages";
    process.env.MUSHAF_AYAT_BASE_URL = "https://cdn.example/ayat";
    process.env.MUSHAF_WORDS_BASE_URL = "https://cdn.example/words";

    assert.equal(getRemoteAyahImageUrl(0, 1), null);
    assert.equal(getRemoteAyahImageUrl(1.5, 1), null);
    assert.equal(getRemoteWordImageUrl(-1), null);
    assert.equal(getRemoteWordImageUrl(Number.NaN), null);
    assert.equal(
      getRemotePageImageUrl(0),
      "https://cdn.example/pages/page_000.png?v=4",
    );
  });
});

describe("Mushaf manifest normalization and failures", () => {
  beforeEach(() => {
    process.env.MUSHAF_CDN_ENABLED = "true";
    process.env.MUSHAF_MANIFESTS_BASE_URL = "https://cdn.example/manifests/";
  });

  it("normalizes aliases, numeric strings, locations, and invalid hitboxes", async () => {
    setJsonFetch({
      imageWidth: "1400",
      image_height: 2000,
      words: [
        {
          x: "1.5",
          y: 2,
          w: 30,
          h: "40",
          location: "2:255:3",
          text: "word",
          wordId: "9",
        },
        { x: 0, y: 0, width: 10, height: 20, surah: "3", ayah: "4", position: "5" },
        { x: 0, y: 0, width: 0, height: 20 },
        null,
        { x: 0, y: 0, w: 1, h: 1, location: "opaque" },
      ],
    });

    assert.deepEqual(await loadPageManifest(88), {
      page: 88,
      schema_version: "1.0.0",
      image_width: 1400,
      image_height: 2000,
      words: [
        {
          location: "2:255:3",
          surah: 2,
          ayah: 255,
          wordPosition: 3,
          x: 1.5,
          y: 2,
          width: 30,
          height: 40,
          text: "word",
          wordId: 9,
        },
        {
          location: "3:4:5",
          surah: 3,
          ayah: 4,
          wordPosition: 5,
          x: 0,
          y: 0,
          width: 10,
          height: 20,
          text: undefined,
          wordId: undefined,
        },
        {
          location: "opaque",
          surah: undefined,
          ayah: undefined,
          wordPosition: undefined,
          x: 0,
          y: 0,
          width: 1,
          height: 1,
          text: undefined,
          wordId: undefined,
        },
      ],
    });
  });

  it("applies ayah defaults to words without changing explicit locations", async () => {
    setJsonFetch({
      schema_version: "2.0.0",
      image_width: 600,
      image_height: 200,
      words: [
        { x: 1, y: 2, width: 3, height: 4, word_position: 7 },
        { x: 5, y: 6, width: 7, height: 8, location: "9:10:11" },
      ],
    });

    const manifest = await loadAyahManifest(2, 255);
    assert.equal(manifest?.surah, 2);
    assert.equal(manifest?.ayah, 255);
    assert.equal(manifest?.schema_version, "2.0.0");
    assert.deepEqual(
      manifest?.words.map(({ location, surah, ayah, wordPosition }) => ({
        location,
        surah,
        ayah,
        wordPosition,
      })),
      [
        { location: "2:255:7", surah: 2, ayah: 255, wordPosition: 7 },
        { location: "9:10:11", surah: 9, ayah: 10, wordPosition: 11 },
      ],
    );
  });

  it("returns null for invalid normalized dimensions", async () => {
    setJsonFetch({ image_width: 0, image_height: 100, words: [] });
    assert.equal(await loadPageManifest(9999), null);
  });

  it("returns null after remote HTTP, JSON, and fetch failures", async () => {
    setJsonFetch({}, false);
    assert.equal(await loadPageManifest(9999), null);

    globalThis.fetch = (async () => ({
      ok: true,
      json: async () => {
        throw new SyntaxError("bad json");
      },
    })) as typeof fetch;
    assert.equal(await loadAyahManifest(9999, 9999), null);

    globalThis.fetch = (async () => {
      throw new Error("network down");
    }) as typeof fetch;
    assert.equal(await loadPageManifest(9999), null);
  });
});
