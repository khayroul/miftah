import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  getWordTranslationsByHitboxes,
  getWordTranslationsByLocation,
} from "./wbwTranslations";
import type { MushafPageManifest } from "../types/mushaf";

async function loadPageManifest(page: number): Promise<MushafPageManifest> {
  const filePath = path.resolve(
    "assets/manifests",
    `page_${String(page).padStart(3, "0")}.manifest.json`,
  );
  const raw = await readFile(filePath, "utf-8");
  return JSON.parse(raw) as MushafPageManifest;
}

test("getWordTranslationsByHitboxes realigns noisy glyph positions for 2:7", async () => {
  const manifest = await loadPageManifest(3);
  const ayahWords = manifest.words.filter(
    (word) => word.surah === 2 && word.ayah === 7,
  );
  const translations = await getWordTranslationsByHitboxes(ayahWords);

  assert.equal(translations["2:7:8"]?.bm, "dan atas");
  assert.equal(translations["2:7:10"]?.bm, "tutup/tabir");
  assert.equal(translations["2:7:12"]?.bm, "dan bagi mereka");
  assert.equal(translations["2:7:13"]?.bm, "seksaan");
});

test("getWordTranslationsByLocation returns BM spelling-normalized WBW entries", async () => {
  const translations = await getWordTranslationsByLocation([
    "2:3:7",
    "2:7:11",
    "2:25:8",
    "2:35:18",
    "2:9:10",
    "2:10:8",
    "2:61:46",
    "2:64:7",
    "2:102:42",
    "2:246:29",
    "4:108:14",
    "4:153:22",
    "5:119:17",
    "4:43:16",
    "6:50:28",
    "7:20:1",
    "19:6:8",
    "35:12:7",
    "47:15:21",
    "48:18:2",
    "76:9:3",
    "92:20:3",
  ]);

  assert.equal(translations["2:3:7"]?.bm, "telah Kami beri rezeki kepada mereka");
  assert.equal(translations["2:7:11"]?.bm, "seksaan");
  assert.equal(translations["2:25:8"]?.bm, "syurga-syurga");
  assert.equal(translations["2:35:18"]?.bm, "orang-orang yang zalim");
  assert.equal(translations["2:9:10"]?.bm, "mereka menyedari");
  assert.equal(translations["2:10:8"]?.bm, "seksaan");
  assert.equal(translations["2:61:46"]?.bm, "kerana sesungguhnya mereka");
  assert.equal(translations["2:64:7"]?.bm, "kurnia");
  assert.equal(translations["2:102:42"]?.bm, "dan isterinya");
  assert.equal(translations["2:246:29"]?.bm, "tidak mahu");
  assert.equal(translations["4:108:14"]?.bm, "Dia meredhai");
  assert.equal(translations["4:153:22"]?.bm, "dengan/kerana kezaliman mereka");
  assert.equal(translations["4:43:16"]?.bm, "sekadar");
  assert.equal(translations["5:119:17"]?.bm, "redha");
  assert.equal(translations["6:50:28"]?.bm, "kamu berfikir");
  assert.equal(translations["7:20:1"]?.bm, "maka membisikkan fikiran jahat");
  assert.equal(translations["19:6:8"]?.bm, "seorang yang diredhai");
  assert.equal(translations["35:12:7"]?.bm, "lazat/sedap");
  assert.equal(translations["47:15:21"]?.bm, "lazat rasanya");
  assert.equal(translations["48:18:2"]?.bm, "meredhai");
  assert.equal(translations["76:9:3"]?.bm, "kerana mengharap keredhaan");
  assert.equal(translations["92:20:3"]?.bm, "keredhaan");
});
