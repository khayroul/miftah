import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getWordTranslationsByHitboxes } from "./wbwTranslations";
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
  assert.equal(translations["2:7:13"]?.bm, "siksaan");
});
