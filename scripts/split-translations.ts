/**
 * split-translations.ts
 *
 * Build-time script: merges BM and EN word-by-word translations and splits
 * them into 604 per-page JSON files under public/translations/.
 *
 * Usage:
 *   npx tsx scripts/split-translations.ts
 *
 * Output format (public/translations/page-NNN.json):
 *   { "1:1:1": { "bm": "dengan nama", "en": "In (the) name" }, ... }
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";

const PROJECT_ROOT = new URL("..", import.meta.url).pathname;

const BM_PATH = join(PROJECT_ROOT, "data/bm_wbw_complete.json");
const EN_PATH = join(PROJECT_ROOT, "data/qul/english-wbw-translation.json");
const LAYOUT_DIR = join(PROJECT_ROOT, "data/mushaf-layout/mushaf");
const OUTPUT_DIR = join(PROJECT_ROOT, "public/translations");

const EXPECTED_PAGE_COUNT = 604;
const MAX_ZERO_TRANSLATION_PAGES = 5;

interface LayoutWord {
  location: string;
  [key: string]: unknown;
}

interface LayoutLine {
  words?: LayoutWord[];
  [key: string]: unknown;
}

interface LayoutPage {
  page: number;
  lines: LayoutLine[];
}

interface PageTranslationEntry {
  bm?: string;
  en?: string;
}

type PageTranslationMap = Record<string, PageTranslationEntry>;

function formatPageNumber(pageNumber: number): string {
  return String(pageNumber).padStart(3, "0");
}

function readJsonFile<T>(filePath: string): T {
  const content = readFileSync(filePath, "utf-8");
  return JSON.parse(content) as T;
}

function loadLayoutFiles(): Map<number, LayoutPage> {
  const files = readdirSync(LAYOUT_DIR)
    .filter((f) => f.match(/^page-\d{3}\.json$/))
    .sort();

  if (files.length !== EXPECTED_PAGE_COUNT) {
    throw new Error(
      `Expected ${EXPECTED_PAGE_COUNT} layout files, found ${files.length} in ${LAYOUT_DIR}`
    );
  }

  const layouts = new Map<number, LayoutPage>();

  for (const file of files) {
    const filePath = join(LAYOUT_DIR, file);
    const data = readJsonFile<LayoutPage>(filePath);
    layouts.set(data.page, data);
  }

  return layouts;
}

function extractLocationsFromPage(layout: LayoutPage): string[] {
  const locations: string[] = [];

  for (const line of layout.lines) {
    if (!line.words) continue;
    for (const word of line.words) {
      if (typeof word.location === "string" && word.location.length > 0) {
        locations.push(word.location);
      }
    }
  }

  return locations;
}

function buildPageTranslations(
  locations: string[],
  bmMap: Record<string, string>,
  enMap: Record<string, string>
): PageTranslationMap {
  const pageMap: PageTranslationMap = {};

  for (const location of locations) {
    const bm = bmMap[location];
    const en = enMap[location];

    if (bm !== undefined || en !== undefined) {
      pageMap[location] = {
        ...(bm !== undefined ? { bm } : {}),
        ...(en !== undefined ? { en } : {}),
      };
    }
  }

  return pageMap;
}

function run(): void {
  console.log("Loading BM translations...");
  const bmMap = readJsonFile<Record<string, string>>(BM_PATH);
  console.log(`  ${Object.keys(bmMap).length} BM entries loaded`);

  console.log("Loading EN translations...");
  const enMap = readJsonFile<Record<string, string>>(EN_PATH);
  console.log(`  ${Object.keys(enMap).length} EN entries loaded`);

  console.log("Loading layout files...");
  const layouts = loadLayoutFiles();
  console.log(`  ${layouts.size} layout files loaded`);

  mkdirSync(OUTPUT_DIR, { recursive: true });

  let zeroTranslationPages = 0;

  for (let pageNum = 1; pageNum <= EXPECTED_PAGE_COUNT; pageNum++) {
    const layout = layouts.get(pageNum);
    if (!layout) {
      throw new Error(`Layout for page ${pageNum} not found`);
    }

    const locations = extractLocationsFromPage(layout);
    const pageTranslations = buildPageTranslations(locations, bmMap, enMap);
    const translationCount = Object.keys(pageTranslations).length;

    if (translationCount === 0 && pageNum > 2) {
      zeroTranslationPages++;
      console.warn(
        `  WARNING: Page ${pageNum} has zero translations (${locations.length} word locations found)`
      );
    }

    const padded = formatPageNumber(pageNum);
    const outputPath = join(OUTPUT_DIR, `page-${padded}.json`);
    writeFileSync(outputPath, JSON.stringify(pageTranslations, null, 2), "utf-8");
  }

  if (zeroTranslationPages > MAX_ZERO_TRANSLATION_PAGES) {
    throw new Error(
      `${zeroTranslationPages} pages have zero translations, exceeding the limit of ${MAX_ZERO_TRANSLATION_PAGES}`
    );
  }

  const outputFiles = readdirSync(OUTPUT_DIR).filter((f) =>
    f.match(/^page-\d{3}\.json$/)
  );

  console.log(`\nDone. ${outputFiles.length} translation files written to ${OUTPUT_DIR}`);

  if (zeroTranslationPages > 0) {
    console.warn(`  ${zeroTranslationPages} pages had zero translations (warnings above)`);
  }
}

run();
