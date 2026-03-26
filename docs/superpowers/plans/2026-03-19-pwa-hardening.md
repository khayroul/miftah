# PWA Hardening Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Miftah into an installable PWA with offline Quran reading — downloadable surahs with tap-to-translate, working without internet.

**Architecture:** Five layers built bottom-up: installability → service worker → content packs → offline reading → download UX. Online reading path stays untouched. Offline uses a separate client-side rendering path reading from Cache API + IndexedDB. Hand-rolled SW with URL allowlist interception.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Cache API, IndexedDB, esbuild (offline bundle), `node:test` for tests.

**Spec:** `docs/superpowers/specs/2026-03-19-pwa-hardening-design.md`

---

## Chunk 1: Build Pipeline & Installability

### Task 1: Generate surah-to-page mapping

**Files:**
- Create: `scripts/generate-surah-map.ts`
- Create: `src/lib/pwa/surahPageMap.ts` (generated output)
- Test: `src/lib/pwa/surahPageMap.test.ts`

The surah-to-page map tells us which mushaf pages belong to which surah. It's generated from layout JSONs + quran-data.xml at build time.

- [ ] **Step 1: Write the test for surahPageMap**

```typescript
// src/lib/pwa/surahPageMap.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { SURAH_PAGE_MAP } from "./surahPageMap";

test("SURAH_PAGE_MAP has exactly 114 surahs", () => {
  assert.equal(Object.keys(SURAH_PAGE_MAP).length, 114);
});

test("Al-Fatihah occupies page 1 only", () => {
  assert.deepEqual(SURAH_PAGE_MAP[1], { startPage: 1, endPage: 1 });
});

test("Al-Baqarah starts at page 2", () => {
  assert.equal(SURAH_PAGE_MAP[2].startPage, 2);
});

test("An-Nas ends at page 604", () => {
  assert.equal(SURAH_PAGE_MAP[114].endPage, 604);
});

test("page ranges are contiguous — no gaps or overlaps", () => {
  const entries = Object.entries(SURAH_PAGE_MAP)
    .map(([id, range]) => ({ id: Number(id), ...range }))
    .sort((a, b) => a.startPage - b.startPage);

  for (let i = 1; i < entries.length; i++) {
    const prev = entries[i - 1];
    const curr = entries[i];
    // A surah can start on the same page the previous surah ends on
    // (cross-surah pages), so curr.startPage >= prev.endPage
    assert.ok(
      curr.startPage >= prev.endPage,
      `Gap between surah ${prev.id} (end ${prev.endPage}) and surah ${curr.id} (start ${curr.startPage})`,
    );
  }
});
```

- [ ] **Step 2: Run test — expect FAIL** (module doesn't exist yet)

Run: `npx tsx --test src/lib/pwa/surahPageMap.test.ts`
Expected: FAIL — cannot find module

- [ ] **Step 3: Write the generator script**

```typescript
// scripts/generate-surah-map.ts
// Reads layout JSONs to determine which pages each surah occupies.
// Each layout JSON has lines with words containing location "surah:ayah:word".
// For each page, extract the surah numbers present, then compute start/end ranges.

import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import path from "node:path";

const LAYOUT_DIR = path.join(process.cwd(), "data", "mushaf-layout", "mushaf");
const OUTPUT_PATH = path.join(process.cwd(), "src", "lib", "pwa", "surahPageMap.ts");

interface LayoutJson {
  page: number;
  lines: Array<{
    type: string;
    words?: Array<{ location: string }>;
  }>;
}

function extractSurahsFromPage(layoutPath: string): number[] {
  const raw = readFileSync(layoutPath, "utf-8");
  const layout = JSON.parse(raw) as LayoutJson;
  const surahIds = new Set<number>();

  for (const line of layout.lines) {
    if (line.words) {
      for (const word of line.words) {
        const match = word.location.match(/^(\d+):/);
        if (match) {
          surahIds.add(Number(match[1]));
        }
      }
    }
  }

  return Array.from(surahIds).sort((a, b) => a - b);
}

function main(): void {
  const files = readdirSync(LAYOUT_DIR)
    .filter((f) => f.startsWith("page-") && f.endsWith(".json"))
    .sort();

  if (files.length !== 604) {
    throw new Error(`Expected 604 layout files, found ${files.length}`);
  }

  // Map: surahId -> Set<pageNumber>
  const surahPages = new Map<number, Set<number>>();

  for (const file of files) {
    const pageMatch = file.match(/page-(\d+)\.json$/);
    if (!pageMatch) continue;
    const pageNumber = Number(pageMatch[1]);
    const surahIds = extractSurahsFromPage(path.join(LAYOUT_DIR, file));

    for (const surahId of surahIds) {
      const pages = surahPages.get(surahId) ?? new Set<number>();
      pages.add(pageNumber);
      surahPages.set(surahId, pages);
    }
  }

  if (surahPages.size !== 114) {
    throw new Error(`Expected 114 surahs, found ${surahPages.size}`);
  }

  const entries: string[] = [];
  for (let surahId = 1; surahId <= 114; surahId++) {
    const pages = surahPages.get(surahId);
    if (!pages || pages.size === 0) {
      throw new Error(`Surah ${surahId} has no pages`);
    }
    const sorted = Array.from(pages).sort((a, b) => a - b);
    entries.push(`  ${surahId}: { startPage: ${sorted[0]}, endPage: ${sorted[sorted.length - 1]} }`);
  }

  const output = `// AUTO-GENERATED by scripts/generate-surah-map.ts — do not edit manually
export const SURAH_PAGE_MAP: Record<number, { startPage: number; endPage: number }> = {
${entries.join(",\n")},
};

export function getPageSurahId(pageNumber: number): number | null {
  for (const [surahId, range] of Object.entries(SURAH_PAGE_MAP)) {
    if (pageNumber >= range.startPage && pageNumber <= range.endPage) {
      return Number(surahId);
    }
  }
  return null;
}

export function getSurahPageCount(surahId: number): number {
  const range = SURAH_PAGE_MAP[surahId];
  if (!range) return 0;
  return range.endPage - range.startPage + 1;
}
`;

  mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, output, "utf-8");
  console.log(`Generated ${OUTPUT_PATH} with ${surahPages.size} surahs`);
}

main();
```

- [ ] **Step 4: Run the generator**

Run: `npx tsx scripts/generate-surah-map.ts`
Expected: `Generated src/lib/pwa/surahPageMap.ts with 114 surahs`

- [ ] **Step 5: Run the test — expect PASS**

Run: `npx tsx --test src/lib/pwa/surahPageMap.test.ts`
Expected: All 5 tests PASS

- [ ] **Step 6: Commit**

```bash
git add scripts/generate-surah-map.ts src/lib/pwa/surahPageMap.ts src/lib/pwa/surahPageMap.test.ts
git commit -m "feat(pwa): add surah-to-page map generator

Build-time script reads layout JSONs to produce a static mapping of
which mushaf pages belong to each surah (1-114). Includes helper
functions for page-to-surah lookup and page count."
```

---

### Task 2: Split translations per page

**Files:**
- Create: `scripts/split-translations.ts`
- Create: `src/lib/pwa/offlineTranslations.ts`
- Test: `src/lib/pwa/offlineTranslations.test.ts`
- Modify: `.gitignore`

Translation data is currently a 2.3 MB monolith (`data/bm_wbw_complete.json`). This script splits it into 604 per-page JSON files in `public/translations/`, each containing both BM and EN translations for words on that page. The key format is `"surah:ayah:word"` → `{ bm, en }`.

- [ ] **Step 1: Write the test for offlineTranslations module**

```typescript
// src/lib/pwa/offlineTranslations.test.ts
import test from "node:test";
import assert from "node:assert/strict";

// Test the translation file format produced by the split script.
// We can't test the actual fetch() in node:test, so test the shape validator.
import { validatePageTranslations } from "./offlineTranslations";

test("validatePageTranslations accepts valid format", () => {
  const data = {
    "1:1:1": { bm: "dengan nama", en: "In (the) name" },
    "1:1:2": { bm: "Allah", en: "(of) Allah" },
  };
  const result = validatePageTranslations(data);
  assert.equal(Object.keys(result).length, 2);
  assert.equal(result["1:1:1"].bm, "dengan nama");
  assert.equal(result["1:1:1"].en, "In (the) name");
});

test("validatePageTranslations filters invalid entries", () => {
  const data = {
    "1:1:1": { bm: "dengan nama", en: "In (the) name" },
    "bad": "not an object",
    "1:1:2": { bm: "", en: "" },
  };
  const result = validatePageTranslations(data);
  assert.equal(Object.keys(result).length, 1);
});

test("validatePageTranslations returns empty for null input", () => {
  const result = validatePageTranslations(null);
  assert.equal(Object.keys(result).length, 0);
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `npx tsx --test src/lib/pwa/offlineTranslations.test.ts`
Expected: FAIL — module doesn't exist

- [ ] **Step 3: Write offlineTranslations module**

```typescript
// src/lib/pwa/offlineTranslations.ts
import type { MushafWordTranslationMap } from "@/types/mushaf";

interface RawPageTranslation {
  bm?: string;
  en?: string;
}

export function validatePageTranslations(
  data: unknown,
): MushafWordTranslationMap {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return {};
  }

  const result: MushafWordTranslationMap = {};
  for (const [location, value] of Object.entries(data as Record<string, unknown>)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      continue;
    }
    const entry = value as RawPageTranslation;
    const bm = typeof entry.bm === "string" && entry.bm.length > 0 ? entry.bm : undefined;
    const en = typeof entry.en === "string" && entry.en.length > 0 ? entry.en : undefined;
    if (!bm && !en) {
      continue;
    }
    result[location] = { location, bm, en };
  }
  return result;
}

function padPage(pageNumber: number): string {
  return String(pageNumber).padStart(3, "0");
}

export async function fetchPageTranslations(
  pageNumber: number,
): Promise<MushafWordTranslationMap> {
  try {
    const response = await fetch(`/translations/page-${padPage(pageNumber)}.json`);
    if (!response.ok) {
      return {};
    }
    const data: unknown = await response.json();
    return validatePageTranslations(data);
  } catch {
    return {};
  }
}
```

- [ ] **Step 4: Run test — expect PASS**

Run: `npx tsx --test src/lib/pwa/offlineTranslations.test.ts`
Expected: All 3 tests PASS

- [ ] **Step 5: Write the split-translations script**

```typescript
// scripts/split-translations.ts
// Merges BM + EN translation files and splits into 604 per-page JSON files.
// Each output file contains { "surah:ayah:word": { bm: "...", en: "..." } }
// for all words on that page (determined from layout JSON word locations).

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";

const BM_PATH = path.join(process.cwd(), "data", "bm_wbw_complete.json");
const EN_PATH = path.join(process.cwd(), "data", "qul", "english-wbw-translation.json");
const LAYOUT_DIR = path.join(process.cwd(), "data", "mushaf-layout", "mushaf");
const OUTPUT_DIR = path.join(process.cwd(), "public", "translations");

function main(): void {
  const bmRaw = JSON.parse(readFileSync(BM_PATH, "utf-8")) as Record<string, string>;
  const enRaw = JSON.parse(readFileSync(EN_PATH, "utf-8")) as Record<string, string>;

  const layoutFiles = readdirSync(LAYOUT_DIR)
    .filter((f) => f.startsWith("page-") && f.endsWith(".json"))
    .sort();

  if (layoutFiles.length !== 604) {
    throw new Error(`Expected 604 layout files, found ${layoutFiles.length}`);
  }

  mkdirSync(OUTPUT_DIR, { recursive: true });
  let totalEntries = 0;
  let emptyPages = 0;

  for (const file of layoutFiles) {
    const pageMatch = file.match(/page-(\d+)\.json$/);
    if (!pageMatch) continue;
    const pageNumber = Number(pageMatch[1]);
    const padded = String(pageNumber).padStart(3, "0");

    const layout = JSON.parse(
      readFileSync(path.join(LAYOUT_DIR, file), "utf-8"),
    ) as { lines: Array<{ words?: Array<{ location: string }> }> };

    // Collect unique word locations from this page
    const locations = new Set<string>();
    for (const line of layout.lines) {
      if (line.words) {
        for (const word of line.words) {
          if (word.location && !word.location.startsWith("unknown:")) {
            locations.add(word.location);
          }
        }
      }
    }

    // Build merged translations for this page
    const pageTranslations: Record<string, { bm?: string; en?: string }> = {};
    for (const location of locations) {
      const bm = bmRaw[location];
      const en = enRaw[location];
      if (bm || en) {
        pageTranslations[location] = {};
        if (bm) pageTranslations[location].bm = bm;
        if (en) pageTranslations[location].en = en;
      }
    }

    const entryCount = Object.keys(pageTranslations).length;
    if (entryCount === 0) {
      // Pages 1-2 might have only basmala/surah-header with no translatable words
      // Log but only fail if it's a regular text page (page > 2)
      if (pageNumber > 2) {
        emptyPages++;
        console.warn(`WARNING: Page ${pageNumber} has zero translations`);
      }
    }

    totalEntries += entryCount;
    writeFileSync(
      path.join(OUTPUT_DIR, `page-${padded}.json`),
      JSON.stringify(pageTranslations),
      "utf-8",
    );
  }

  if (emptyPages > 5) {
    throw new Error(`Too many empty pages (${emptyPages}). Check translation data.`);
  }

  console.log(`Split translations: ${layoutFiles.length} pages, ${totalEntries} total entries`);
}

main();
```

- [ ] **Step 6: Add to .gitignore**

Append to `.gitignore`:
```
# PWA generated files (build-time)
public/translations/
public/layouts/
public/pwa-config.json
```

- [ ] **Step 7: Run the split script**

Run: `npx tsx scripts/split-translations.ts`
Expected: `Split translations: 604 pages, XXXXX total entries`

Verify: `ls public/translations/ | wc -l` → 604

- [ ] **Step 8: Commit**

```bash
git add scripts/split-translations.ts src/lib/pwa/offlineTranslations.ts src/lib/pwa/offlineTranslations.test.ts .gitignore
git commit -m "feat(pwa): split translations per-page and add offline loader

Build script merges BM + EN word translations and splits into 604
per-page JSON files. New offlineTranslations module validates and
fetches per-page files for client-side offline use."
```

---

### Task 3: Copy layout JSONs to public

**Files:**
- Create: `scripts/copy-layouts.ts`

Layout JSONs are server-only files at `data/mushaf-layout/mushaf/page-NNN.json`. For offline reading, they need to be URL-accessible. This script copies them to `public/layouts/`.

- [ ] **Step 1: Write the copy script**

```typescript
// scripts/copy-layouts.ts
import { readdirSync, copyFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const SOURCE_DIR = path.join(process.cwd(), "data", "mushaf-layout", "mushaf");
const OUTPUT_DIR = path.join(process.cwd(), "public", "layouts");

function main(): void {
  const files = readdirSync(SOURCE_DIR)
    .filter((f) => f.startsWith("page-") && f.endsWith(".json"));

  if (files.length !== 604) {
    throw new Error(`Expected 604 layout files, found ${files.length}`);
  }

  mkdirSync(OUTPUT_DIR, { recursive: true });

  for (const file of files) {
    copyFileSync(path.join(SOURCE_DIR, file), path.join(OUTPUT_DIR, file));
  }

  console.log(`Copied ${files.length} layout files to ${OUTPUT_DIR}`);
}

main();
```

- [ ] **Step 2: Run it**

Run: `npx tsx scripts/copy-layouts.ts`
Expected: `Copied 604 layout files to ...public/layouts`

- [ ] **Step 3: Commit**

```bash
git add scripts/copy-layouts.ts
git commit -m "feat(pwa): add layout JSON copy script for client-side access"
```

---

### Task 4: Generate pwa-config.json

**Files:**
- Create: `scripts/generate-pwa-config.ts`

Generates `public/pwa-config.json` with CDN URLs and asset version for client-side download logic.

- [ ] **Step 1: Write the config generator**

```typescript
// scripts/generate-pwa-config.ts
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

const OUTPUT_PATH = path.join(process.cwd(), "public", "pwa-config.json");

function extractCdnVersion(): string {
  // Read CDN_ASSET_VERSION from mushafAssets.ts
  const assetsPath = path.join(process.cwd(), "src", "lib", "mushafAssets.ts");
  const content = readFileSync(assetsPath, "utf-8");
  const match = content.match(/CDN_ASSET_VERSION\s*=\s*"(\d+)"/);
  if (!match) {
    throw new Error("Could not find CDN_ASSET_VERSION in mushafAssets.ts");
  }
  return match[1];
}

function main(): void {
  const cdnVersion = extractCdnVersion();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const pagesBucket = process.env.MUSHAF_PAGES_BUCKET?.trim() || "mushaf-pages";
  const manifestsBucket = process.env.MUSHAF_MANIFESTS_BUCKET?.trim() || "mushaf-manifests";

  const storageBase = supabaseUrl
    ? `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public`
    : "";

  const config = {
    cdnAssetVersion: cdnVersion,
    supabaseStorageBase: storageBase,
    pagesBucket,
    manifestsBucket,
  };

  mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(config, null, 2), "utf-8");
  console.log(`Generated ${OUTPUT_PATH} (version: ${cdnVersion})`);
}

main();
```

- [ ] **Step 2: Run it**

Run: `npx tsx scripts/generate-pwa-config.ts`
Expected: `Generated .../public/pwa-config.json (version: 4)`

- [ ] **Step 3: Commit**

```bash
git add scripts/generate-pwa-config.ts
git commit -m "feat(pwa): add pwa-config.json generator for client CDN config"
```

---

### Task 5: PWA manifest and meta tags

**Files:**
- Create: `src/app/manifest.ts`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Create the manifest**

```typescript
// src/app/manifest.ts
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Miftah — مفتاح",
    short_name: "Miftah",
    description: "Hafal Quran dengan faham.",
    start_url: "/",
    display: "standalone",
    background_color: "#1a1a2e",
    theme_color: "#1a1a2e",
    orientation: "portrait",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-192-maskable.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
```

- [ ] **Step 2: Add meta tags to layout.tsx**

In `src/app/layout.tsx`, add inside `<head>` (after the existing `<script>` block):

```html
<meta name="theme-color" content="#1a1a2e" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
```

- [ ] **Step 3: Create placeholder icons**

Create minimal placeholder icons. Use a simple script or ImageMagick:

```bash
mkdir -p public/icons
# Generate solid-color placeholder PNGs (replace with designed icons later)
convert -size 192x192 xc:"#1a1a2e" -fill white -gravity center -pointsize 80 -annotate 0 "م" public/icons/icon-192.png
convert -size 512x512 xc:"#1a1a2e" -fill white -gravity center -pointsize 200 -annotate 0 "م" public/icons/icon-512.png
cp public/icons/icon-192.png public/icons/icon-192-maskable.png
cp public/icons/icon-512.png public/icons/icon-512-maskable.png
cp public/icons/icon-192.png public/icons/apple-touch-icon.png
```

If ImageMagick is not available, create 1x1 placeholder PNGs and note them for replacement (KHA-186).

- [ ] **Step 4: Build and verify**

Run: `npm run build`
Expected: Build succeeds. Check that `/manifest.webmanifest` is served.

- [ ] **Step 5: Commit**

```bash
git add src/app/manifest.ts src/app/layout.tsx public/icons/
git commit -m "feat(pwa): add web app manifest, meta tags, and placeholder icons

KHA-27: Installability foundation. Adds manifest.ts with app name,
theme color, orientation, and icon references. Adds Apple meta tags
for iOS standalone mode. Placeholder icons to be replaced (KHA-186)."
```

---

### Task 6: Build ID injection script

**Files:**
- Create: `scripts/inject-build-id.ts`
- Modify: `public/sw.js` (add placeholder)

The BUILD_ID is used for app shell cache naming. It's a short git SHA generated at prebuild time, NOT the Next.js build ID (which doesn't exist until `next build` runs, but `public/sw.js` is consumed during that same build).

- [ ] **Step 1: Add placeholder to sw.js**

Replace the entire content of `public/sw.js` with just the placeholder for now:

```javascript
// Miftah PWA Service Worker
// BUILD_ID and CDN_ASSET_VERSION are injected at build time by scripts/inject-build-id.ts
const BUILD_ID = "__BUILD_ID__";
const CDN_ASSET_VERSION = "__CDN_ASSET_VERSION__";

// Full SW implementation added in Task 9
const AUDIO_CACHE = "miftah-audio-v1";
const AUDIO_HOST = "everyayah.com";

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (!url.hostname.includes(AUDIO_HOST)) return;
  event.respondWith(
    caches.open(AUDIO_CACHE).then(async (cache) => {
      const cached = await cache.match(event.request);
      if (cached) return cached;
      const response = await fetch(event.request);
      if (response.ok) cache.put(event.request, response.clone());
      return response;
    }),
  );
});
```

- [ ] **Step 2: Write the injection script**

```typescript
// scripts/inject-build-id.ts
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const SW_PATH = path.join(process.cwd(), "public", "sw.js");

function getGitSha(): string {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf-8" }).trim();
  } catch {
    return Date.now().toString(36);
  }
}

function getCdnVersion(): string {
  const assetsPath = path.join(process.cwd(), "src", "lib", "mushafAssets.ts");
  const content = readFileSync(assetsPath, "utf-8");
  const match = content.match(/CDN_ASSET_VERSION\s*=\s*"(\d+)"/);
  return match ? match[1] : "1";
}

function main(): void {
  const buildId = getGitSha();
  const cdnVersion = getCdnVersion();

  let sw = readFileSync(SW_PATH, "utf-8");
  sw = sw.replace('"__BUILD_ID__"', `"${buildId}"`);
  sw = sw.replace('"__CDN_ASSET_VERSION__"', `"${cdnVersion}"`);

  writeFileSync(SW_PATH, sw, "utf-8");
  console.log(`Injected BUILD_ID=${buildId}, CDN_ASSET_VERSION=${cdnVersion} into sw.js`);
}

main();
```

- [ ] **Step 3: Run it and verify**

Run: `npx tsx scripts/inject-build-id.ts`
Expected: `Injected BUILD_ID=abc1234, CDN_ASSET_VERSION=4 into sw.js`

Verify: `head -3 public/sw.js` shows the actual values, not placeholders.

**Important:** Reset `sw.js` after verifying so the placeholder is preserved in git. The injection happens at build time only.

```bash
git checkout public/sw.js
```

- [ ] **Step 4: Commit**

```bash
git add scripts/inject-build-id.ts public/sw.js
git commit -m "feat(pwa): add build ID injection script for service worker

Prebuild step replaces __BUILD_ID__ and __CDN_ASSET_VERSION__ placeholders
in sw.js with git SHA and current CDN version. BUILD_ID is NOT the
Next.js build ID (avoids chicken-and-egg with next build)."
```

---

### Task 7: Wire up prebuild pipeline in package.json

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add prebuild scripts**

Add to `package.json` scripts:

```json
{
  "scripts": {
    "prebuild:surah-map": "tsx scripts/generate-surah-map.ts",
    "prebuild:translations": "tsx scripts/split-translations.ts",
    "prebuild:layouts": "tsx scripts/copy-layouts.ts",
    "prebuild:pwa-config": "tsx scripts/generate-pwa-config.ts",
    "prebuild:inject-build-id": "tsx scripts/inject-build-id.ts",
    "prebuild": "npm run prebuild:surah-map && npm run prebuild:translations && npm run prebuild:layouts && npm run prebuild:pwa-config && npm run prebuild:inject-build-id",
    "build": "npm run prebuild && next build"
  }
}
```

Note: Keep the existing `build` script's Sentry wrapping if present — adjust the chain accordingly.

- [ ] **Step 2: Run full prebuild**

Run: `npm run prebuild`
Expected: All 5 scripts succeed sequentially.

- [ ] **Step 3: Run full build**

Run: `npm run build`
Expected: Next.js build succeeds. `public/translations/`, `public/layouts/`, and `public/pwa-config.json` are all included in the output.

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "feat(pwa): wire prebuild pipeline into package.json

Runs 5 prebuild scripts before next build: surah map generation,
translation splitting, layout copying, PWA config, and build ID
injection. All generated files are gitignored."
```

---

### Task 8: SW registration refactor

**Files:**
- Create: `src/lib/pwa/swRegistration.ts`
- Modify: `src/lib/hifz/audioPreCache.ts`
- Modify: `src/components/ServiceWorkerRegistrar.tsx`

Extract `registerServiceWorker()` from `audioPreCache.ts` to a shared PWA module. Add update detection hooks.

- [ ] **Step 1: Create swRegistration module**

```typescript
// src/lib/pwa/swRegistration.ts
"use client";

type UpdateCallback = () => void;

let updateCallbacks: UpdateCallback[] = [];

export function onSwUpdate(callback: UpdateCallback): () => void {
  updateCallbacks = [...updateCallbacks, callback];
  return () => {
    updateCallbacks = updateCallbacks.filter((cb) => cb !== callback);
  };
}

function notifyUpdate(): void {
  for (const callback of updateCallbacks) {
    callback();
  }
}

export function registerServiceWorker(): void {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }

  navigator.serviceWorker
    .register("/sw.js")
    .then((registration) => {
      registration.addEventListener("updatefound", () => {
        const newWorker = registration.installing;
        if (!newWorker) return;

        newWorker.addEventListener("statechange", () => {
          if (
            newWorker.state === "installed" &&
            navigator.serviceWorker.controller
          ) {
            notifyUpdate();
          }
        });
      });
    })
    .catch(() => {
      // SW registration failed — offline features won't work, but app continues
    });
}

export function skipWaitingAndReload(): void {
  if (!navigator.serviceWorker.controller) return;

  navigator.serviceWorker.ready.then((registration) => {
    if (registration.waiting) {
      registration.waiting.postMessage({ type: "SKIP_WAITING" });
    }
  });

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    window.location.reload();
  });
}
```

- [ ] **Step 2: Update audioPreCache.ts**

Remove `registerServiceWorker()` from `src/lib/hifz/audioPreCache.ts`. Replace with an import:

```typescript
// At the top of audioPreCache.ts, remove the registerServiceWorker function.
// The SW registration is now handled by src/lib/pwa/swRegistration.ts.
// audioPreCache.ts keeps only preCacheAudioUrls() and clearAudioCache().
```

Delete lines 36-47 (`registerServiceWorker` function) from `audioPreCache.ts`.

- [ ] **Step 3: Update ServiceWorkerRegistrar.tsx**

```typescript
// src/components/ServiceWorkerRegistrar.tsx
"use client";

import { useEffect } from "react";
import { registerServiceWorker } from "@/lib/pwa/swRegistration";

export function ServiceWorkerRegistrar() {
  useEffect(() => {
    registerServiceWorker();
  }, []);
  return null;
}
```

- [ ] **Step 4: Build and verify**

Run: `npm run build`
Expected: Build succeeds, no import errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pwa/swRegistration.ts src/lib/hifz/audioPreCache.ts src/components/ServiceWorkerRegistrar.tsx
git commit -m "refactor(pwa): extract SW registration to shared module

Move registerServiceWorker() from audioPreCache.ts to pwa/swRegistration.ts.
Add SW update detection hooks and skipWaiting helper for the update
flow (KHA-184). ServiceWorkerRegistrar now imports from the new module."
```

---

## Chunk 2: Service Worker & Content Packs

### Task 9: Service worker rewrite

**Files:**
- Rewrite: `public/sw.js`

Rewrite the SW from a 34-line audio-only interceptor to a multi-cache router with URL allowlist. Key behaviors:
- Cache-first for mushaf assets (images, manifests, layouts, translations, audio)
- Cache-first for `/_next/static/*` (content-hashed, safe to cache)
- Network-only for everything else (RSC, API routes, navigation)
- Offline fallback: serve `/offline.html` when navigation fails
- On activate: clean old `app-shell-*` caches
- On message `SKIP_WAITING`: call `self.skipWaiting()`

- [ ] **Step 1: Write the full SW**

```javascript
// public/sw.js
// Miftah PWA Service Worker — multi-cache router with URL allowlist
// BUILD_ID and CDN_ASSET_VERSION injected at prebuild time
const BUILD_ID = "__BUILD_ID__";
const CDN_ASSET_VERSION = "__CDN_ASSET_VERSION__";

const APP_SHELL_CACHE = `app-shell-${BUILD_ID}`;
const MUSHAF_IMAGES_CACHE = "mushaf-images-v1";
const MUSHAF_DATA_CACHE = "mushaf-data-v1";
const AUDIO_CACHE = "miftah-audio-v1";

const APP_SHELL_PRECACHE = ["/offline.html"];

// --- Install ---
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE).then((cache) => cache.addAll(APP_SHELL_PRECACHE))
  );
  // Do NOT call skipWaiting() — wait for user consent via update banner
});

// --- Activate ---
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key.startsWith("app-shell-") && key !== APP_SHELL_CACHE)
          .map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// --- Message ---
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// --- Fetch ---

function isNavigationRequest(request) {
  return request.mode === "navigate";
}

function matchesMushafImage(url) {
  // Supabase Storage WebP images or local API fallback
  if (url.pathname.startsWith("/api/mushaf/")) return true;
  if (url.hostname !== self.location.hostname && url.pathname.endsWith(".webp")) return true;
  return false;
}

function matchesMushafData(url) {
  // Supabase Storage manifest JSON
  if (url.hostname !== self.location.hostname && url.pathname.endsWith(".manifest.json")) return true;
  // Local translation and layout JSONs
  if (url.pathname.startsWith("/translations/page-") && url.pathname.endsWith(".json")) return true;
  if (url.pathname.startsWith("/layouts/page-") && url.pathname.endsWith(".json")) return true;
  return false;
}

function matchesAppShell(url) {
  return url.pathname.startsWith("/_next/static/");
}

function matchesAudio(url) {
  return url.hostname.includes("everyayah.com");
}

function cacheFirst(cacheName) {
  return async (request) => {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    if (cached) return cached;

    try {
      const response = await fetch(request);
      if (response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    } catch (error) {
      return new Response("Network error", { status: 503 });
    }
  };
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Navigation: try network, fallback to offline shell
  if (isNavigationRequest(event.request)) {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match("/offline.html").then(
          (cached) => cached || new Response("Offline", { status: 503 })
        )
      )
    );
    return;
  }

  // Mushaf images (WebP, page API)
  if (matchesMushafImage(url)) {
    event.respondWith(cacheFirst(MUSHAF_IMAGES_CACHE)(event.request));
    return;
  }

  // Mushaf data (manifests, layouts, translations)
  if (matchesMushafData(url)) {
    event.respondWith(cacheFirst(MUSHAF_DATA_CACHE)(event.request));
    return;
  }

  // App shell static assets
  if (matchesAppShell(url)) {
    event.respondWith(cacheFirst(APP_SHELL_CACHE)(event.request));
    return;
  }

  // Audio
  if (matchesAudio(url)) {
    event.respondWith(cacheFirst(AUDIO_CACHE)(event.request));
    return;
  }

  // Everything else: network-only (RSC, API routes, etc.)
  // Don't call event.respondWith() — let the browser handle it normally
});
```

- [ ] **Step 2: Test locally**

Run: `npm run dev`
Open Chrome DevTools → Application → Service Workers. Verify:
- SW registers and activates
- Cache Storage shows `app-shell-*` with `/offline.html`
- Audio caching still works (play a page in Hifz mode)
- Navigate pages — no RSC or API request interception (check Network tab)

- [ ] **Step 3: Commit**

```bash
git add public/sw.js
git commit -m "feat(pwa): rewrite service worker with multi-cache URL allowlist

KHA-28: Full SW rewrite. Cache-first for mushaf images, manifests,
layouts, translations, audio, and app shell statics. Network-only
for all other requests (RSC, API, navigation). Offline fallback
serves /offline.html. Build-time BUILD_ID for cache versioning.
No skipWaiting on install — update requires user consent."
```

---

### Task 10: IndexedDB pack manager

**Files:**
- Create: `src/lib/pwa/packDb.ts`
- Test: `src/lib/pwa/packDb.test.ts`

IndexedDB wrapper for surah pack metadata. Manages `surahPacks` and `downloadHistory` stores.

- [ ] **Step 1: Write the test**

```typescript
// src/lib/pwa/packDb.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  createEmptyPack,
  updatePackStatus,
  type SurahPack,
} from "./packDb";

test("createEmptyPack produces valid pack shape", () => {
  const pack = createEmptyPack(2, [2, 49]);
  assert.equal(pack.surahId, 2);
  assert.equal(pack.status, "pending");
  assert.deepEqual(pack.pageRange, [2, 49]);
  assert.equal(pack.totalPages, 48);
  assert.equal(pack.downloadedPages, 0);
  assert.equal(pack.totalSizeBytes, 0);
  assert.equal(pack.downloadedAt, null);
  assert.equal(pack.errorMessage, null);
});

test("updatePackStatus returns new object with updated fields", () => {
  const pack = createEmptyPack(1, [1, 1]);
  const updated = updatePackStatus(pack, {
    status: "downloading",
    downloadedPages: 0,
  });
  assert.equal(updated.status, "downloading");
  assert.notStrictEqual(updated, pack); // immutable
  assert.equal(pack.status, "pending"); // original unchanged
});

test("updatePackStatus with complete status sets downloadedAt", () => {
  const pack = createEmptyPack(1, [1, 1]);
  const updated = updatePackStatus(pack, { status: "complete" });
  assert.equal(updated.status, "complete");
  assert.ok(updated.downloadedAt !== null);
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `npx tsx --test src/lib/pwa/packDb.test.ts`

- [ ] **Step 3: Write packDb module**

```typescript
// src/lib/pwa/packDb.ts

export interface SurahPack {
  readonly surahId: number;
  readonly status: "pending" | "downloading" | "complete" | "error";
  readonly pageRange: readonly [number, number];
  readonly totalPages: number;
  readonly downloadedPages: number;
  readonly totalSizeBytes: number;
  readonly assetVersion: string;
  readonly downloadedAt: string | null;
  readonly errorMessage: string | null;
}

export interface DownloadHistoryEntry {
  readonly surahId: number;
  readonly lastDownloadedAt: string;
}

export function createEmptyPack(
  surahId: number,
  pageRange: [number, number],
): SurahPack {
  return {
    surahId,
    status: "pending",
    pageRange,
    totalPages: pageRange[1] - pageRange[0] + 1,
    downloadedPages: 0,
    totalSizeBytes: 0,
    assetVersion: "",
    downloadedAt: null,
    errorMessage: null,
  };
}

export function updatePackStatus(
  pack: SurahPack,
  updates: Partial<Pick<SurahPack, "status" | "downloadedPages" | "totalSizeBytes" | "assetVersion" | "errorMessage">>,
): SurahPack {
  const next = { ...pack, ...updates };
  if (updates.status === "complete" && !next.downloadedAt) {
    return { ...next, downloadedAt: new Date().toISOString() };
  }
  return next;
}

// --- IndexedDB operations (browser-only) ---

const DB_NAME = "miftah-pwa";
const DB_VERSION = 1;
const PACKS_STORE = "surahPacks";
const HISTORY_STORE = "downloadHistory";
const DOWNLOAD_HISTORY_KEY = "miftah.download.history.v1";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PACKS_STORE)) {
        db.createObjectStore(PACKS_STORE, { keyPath: "surahId" });
      }
      if (!db.objectStoreNames.contains(HISTORY_STORE)) {
        db.createObjectStore(HISTORY_STORE, { keyPath: "surahId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function idbGet<T>(store: string, key: number): Promise<T | undefined> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(store, "readonly");
        const req = tx.objectStore(store).get(key);
        req.onsuccess = () => resolve(req.result as T | undefined);
        req.onerror = () => reject(req.error);
      }),
  );
}

function idbPut<T>(store: string, value: T): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(store, "readwrite");
        tx.objectStore(store).put(value);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      }),
  );
}

function idbGetAll<T>(store: string): Promise<T[]> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(store, "readonly");
        const req = tx.objectStore(store).getAll();
        req.onsuccess = () => resolve(req.result as T[]);
        req.onerror = () => reject(req.error);
      }),
  );
}

export async function getPack(surahId: number): Promise<SurahPack | undefined> {
  return idbGet<SurahPack>(PACKS_STORE, surahId);
}

export async function savePack(pack: SurahPack): Promise<void> {
  await idbPut(PACKS_STORE, pack);
}

export async function getAllPacks(): Promise<SurahPack[]> {
  return idbGetAll<SurahPack>(PACKS_STORE);
}

export async function recordDownloadHistory(surahId: number): Promise<void> {
  const entry: DownloadHistoryEntry = {
    surahId,
    lastDownloadedAt: new Date().toISOString(),
  };
  await idbPut(HISTORY_STORE, entry);

  // Mirror to localStorage for iOS eviction recovery
  try {
    const raw = localStorage.getItem(DOWNLOAD_HISTORY_KEY);
    const ids: number[] = raw ? JSON.parse(raw) : [];
    if (!ids.includes(surahId)) {
      localStorage.setItem(
        DOWNLOAD_HISTORY_KEY,
        JSON.stringify([...ids, surahId]),
      );
    }
  } catch {
    // localStorage not available
  }
}

export function getDownloadHistoryFromLocalStorage(): number[] {
  try {
    const raw = localStorage.getItem(DOWNLOAD_HISTORY_KEY);
    return raw ? (JSON.parse(raw) as number[]) : [];
  } catch {
    return [];
  }
}
```

- [ ] **Step 4: Run test — expect PASS**

Run: `npx tsx --test src/lib/pwa/packDb.test.ts`
Expected: 3 tests PASS (only pure function tests — IndexedDB ops are browser-only)

- [ ] **Step 5: Commit**

```bash
git add src/lib/pwa/packDb.ts src/lib/pwa/packDb.test.ts
git commit -m "feat(pwa): add IndexedDB pack manager for surah download state

KHA-29: SurahPack and DownloadHistory types with IndexedDB CRUD.
Immutable pack updates. Download history mirrored to localStorage
for iOS eviction recovery."
```

---

### Task 11: Content pack download engine

**Files:**
- Create: `src/lib/pwa/downloadEngine.ts`
- Test: `src/lib/pwa/downloadEngine.test.ts`

The download engine fetches and caches all assets for a surah, page by page.

- [ ] **Step 1: Write the test**

```typescript
// src/lib/pwa/downloadEngine.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { buildPageAssetUrls } from "./downloadEngine";

test("buildPageAssetUrls generates correct URLs for page 1", () => {
  const urls = buildPageAssetUrls(1, {
    cdnAssetVersion: "4",
    supabaseStorageBase: "https://test.supabase.co/storage/v1/object/public",
    pagesBucket: "mushaf-pages",
    manifestsBucket: "mushaf-manifests",
  });

  assert.ok(urls.webp.includes("page_001_mobile.webp?v=4"));
  assert.ok(urls.manifest.includes("page_001.manifest.json?v=4"));
  assert.equal(urls.layout, "/layouts/page-001.json");
  assert.equal(urls.translation, "/translations/page-001.json");
});

test("buildPageAssetUrls pads page numbers to 3 digits", () => {
  const urls = buildPageAssetUrls(42, {
    cdnAssetVersion: "5",
    supabaseStorageBase: "https://x.supabase.co/storage/v1/object/public",
    pagesBucket: "mushaf-pages",
    manifestsBucket: "mushaf-manifests",
  });

  assert.ok(urls.webp.includes("page_042_mobile.webp?v=5"));
  assert.ok(urls.manifest.includes("page_042.manifest.json?v=5"));
  assert.equal(urls.layout, "/layouts/page-042.json");
  assert.equal(urls.translation, "/translations/page-042.json");
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `npx tsx --test src/lib/pwa/downloadEngine.test.ts`

- [ ] **Step 3: Write downloadEngine module**

```typescript
// src/lib/pwa/downloadEngine.ts

import {
  createEmptyPack,
  updatePackStatus,
  savePack,
  getPack,
  recordDownloadHistory,
  type SurahPack,
} from "./packDb";
import { SURAH_PAGE_MAP } from "./surahPageMap";

export interface PwaConfig {
  readonly cdnAssetVersion: string;
  readonly supabaseStorageBase: string;
  readonly pagesBucket: string;
  readonly manifestsBucket: string;
}

export interface PageAssetUrls {
  readonly webp: string;
  readonly manifest: string;
  readonly layout: string;
  readonly translation: string;
}

export type DownloadProgress = {
  readonly surahId: number;
  readonly status: "downloading" | "complete" | "error";
  readonly downloadedPages: number;
  readonly totalPages: number;
  readonly errorMessage?: string;
};

type ProgressCallback = (progress: DownloadProgress) => void;

function pad3(n: number): string {
  return String(n).padStart(3, "0");
}

export function buildPageAssetUrls(
  pageNumber: number,
  config: PwaConfig,
): PageAssetUrls {
  const padded = pad3(pageNumber);
  const v = config.cdnAssetVersion;

  return {
    webp: `${config.supabaseStorageBase}/${config.pagesBucket}/page_${padded}_mobile.webp?v=${v}`,
    manifest: `${config.supabaseStorageBase}/${config.manifestsBucket}/page_${padded}.manifest.json?v=${v}`,
    layout: `/layouts/page-${padded}.json`,
    translation: `/translations/page-${padded}.json`,
  };
}

const IMAGES_CACHE = "mushaf-images-v1";
const DATA_CACHE = "mushaf-data-v1";

async function cacheAsset(
  cacheName: string,
  url: string,
): Promise<number> {
  const cache = await caches.open(cacheName);

  // Skip if already cached
  const existing = await cache.match(url);
  if (existing) {
    return 0;
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  const clone = response.clone();
  await cache.put(url, clone);

  // Estimate size from content-length or blob
  const blob = await response.blob();
  return blob.size;
}

async function downloadPage(
  pageNumber: number,
  config: PwaConfig,
): Promise<number> {
  const urls = buildPageAssetUrls(pageNumber, config);
  let totalBytes = 0;

  totalBytes += await cacheAsset(IMAGES_CACHE, urls.webp);
  totalBytes += await cacheAsset(DATA_CACHE, urls.manifest);
  totalBytes += await cacheAsset(DATA_CACHE, urls.layout);
  totalBytes += await cacheAsset(DATA_CACHE, urls.translation);

  return totalBytes;
}

let activeAbortController: AbortController | null = null;

export function cancelDownload(): void {
  activeAbortController?.abort();
  activeAbortController = null;
}

export async function downloadSurah(
  surahId: number,
  config: PwaConfig,
  onProgress?: ProgressCallback,
): Promise<void> {
  const range = SURAH_PAGE_MAP[surahId];
  if (!range) {
    throw new Error(`Unknown surah: ${surahId}`);
  }

  // Concurrency guard
  const existing = await getPack(surahId);
  if (existing?.status === "downloading") {
    return; // Already in progress
  }

  activeAbortController = new AbortController();

  const pack = createEmptyPack(surahId, [range.startPage, range.endPage]);
  let current = updatePackStatus(pack, {
    status: "downloading",
    assetVersion: config.cdnAssetVersion,
  });
  await savePack(current);

  let downloadedPages = 0;
  let totalBytes = 0;

  try {
    for (let page = range.startPage; page <= range.endPage; page++) {
      if (activeAbortController.signal.aborted) {
        current = updatePackStatus(current, {
          status: "error",
          errorMessage: "Cancelled",
          downloadedPages,
          totalSizeBytes: totalBytes,
        });
        await savePack(current);
        return;
      }

      const pageBytes = await downloadPage(page, config);
      totalBytes += pageBytes;
      downloadedPages++;

      current = updatePackStatus(current, {
        downloadedPages,
        totalSizeBytes: totalBytes,
      });
      await savePack(current);

      onProgress?.({
        surahId,
        status: "downloading",
        downloadedPages,
        totalPages: current.totalPages,
      });
    }

    current = updatePackStatus(current, {
      status: "complete",
      downloadedPages,
      totalSizeBytes: totalBytes,
    });
    await savePack(current);
    await recordDownloadHistory(surahId);

    onProgress?.({
      surahId,
      status: "complete",
      downloadedPages,
      totalPages: current.totalPages,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Download failed";
    current = updatePackStatus(current, {
      status: "error",
      errorMessage: message,
      downloadedPages,
      totalSizeBytes: totalBytes,
    });
    await savePack(current);

    onProgress?.({
      surahId,
      status: "error",
      downloadedPages,
      totalPages: current.totalPages,
      errorMessage: message,
    });
  } finally {
    activeAbortController = null;
  }
}

let pwaConfigCache: PwaConfig | null = null;

export async function loadPwaConfig(): Promise<PwaConfig> {
  if (pwaConfigCache) return pwaConfigCache;

  const response = await fetch("/pwa-config.json");
  if (!response.ok) {
    throw new Error("Failed to load PWA config");
  }
  pwaConfigCache = (await response.json()) as PwaConfig;
  return pwaConfigCache;
}
```

- [ ] **Step 4: Run test — expect PASS**

Run: `npx tsx --test src/lib/pwa/downloadEngine.test.ts`
Expected: 2 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/pwa/downloadEngine.ts src/lib/pwa/downloadEngine.test.ts
git commit -m "feat(pwa): add content pack download engine

KHA-29: Downloads all assets for a surah page-by-page into Cache API.
Tracks progress in IndexedDB. Supports cancel, resume (skips cached
pages), and concurrency guard. Loads CDN config from pwa-config.json."
```

---

### Task 12: Dev-only download trigger

**Files:**
- Create: `src/lib/pwa/debugTools.ts`
- Modify: `src/app/layout.tsx` (conditionally load in dev)

For testing Layer 3 before the full download UX exists.

- [ ] **Step 1: Write debugTools**

```typescript
// src/lib/pwa/debugTools.ts
"use client";

import { downloadSurah, loadPwaConfig, cancelDownload } from "./downloadEngine";
import { getAllPacks } from "./packDb";

export function installDebugTools(): void {
  if (typeof window === "undefined") return;

  const debug = {
    async downloadSurah(surahId: number) {
      const config = await loadPwaConfig();
      console.log(`[PWA Debug] Downloading surah ${surahId}...`);
      await downloadSurah(surahId, config, (progress) => {
        console.log(
          `[PWA Debug] Surah ${progress.surahId}: ${progress.downloadedPages}/${progress.totalPages} (${progress.status})`,
        );
      });
      console.log(`[PWA Debug] Done.`);
    },
    cancelDownload,
    async listPacks() {
      const packs = await getAllPacks();
      console.table(packs.map((p) => ({
        surah: p.surahId,
        status: p.status,
        pages: `${p.downloadedPages}/${p.totalPages}`,
        size: `${(p.totalSizeBytes / 1024).toFixed(0)} KB`,
      })));
    },
  };

  (window as unknown as Record<string, unknown>).__miftahDebug = debug;
  console.log("[PWA Debug] Tools available: window.__miftahDebug.downloadSurah(id), .cancelDownload(), .listPacks()");
}
```

- [ ] **Step 2: Load in dev mode**

In `src/app/layout.tsx`, add a conditional client-side load. Create a small wrapper:

```typescript
// src/components/PwaDebugLoader.tsx
"use client";

import { useEffect } from "react";

export function PwaDebugLoader() {
  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      import("@/lib/pwa/debugTools").then(({ installDebugTools }) => {
        installDebugTools();
      });
    }
  }, []);
  return null;
}
```

Add `<PwaDebugLoader />` to `layout.tsx` body, next to `<ServiceWorkerRegistrar />`.

- [ ] **Step 3: Test in dev**

Run: `npm run dev`
Open browser console. Type: `__miftahDebug.downloadSurah(1)`
Expected: Progress logs showing page download, ending with "Done."
Verify: DevTools → Application → Cache Storage → `mushaf-images-v1` contains the page image.

- [ ] **Step 4: Commit**

```bash
git add src/lib/pwa/debugTools.ts src/components/PwaDebugLoader.tsx src/app/layout.tsx
git commit -m "feat(pwa): add dev-only debug tools for testing downloads

Console API: window.__miftahDebug.downloadSurah(id), .cancelDownload(),
.listPacks(). Loaded only in development mode. Enables testing offline
reading (Layer 3) before the full download UX (Layer 4) is built."
```

---

## Chunk 3: Offline Reading, UX & Cross-cutting

### Task 13: Offline page data module

**Files:**
- Create: `src/lib/pwa/offlinePageData.ts`
- Test: `src/lib/pwa/offlinePageData.test.ts`

Client-side module that assembles read-page data from Cache API for offline rendering.

- [ ] **Step 1: Write the test**

```typescript
// src/lib/pwa/offlinePageData.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { isOfflinePageAvailable } from "./offlinePageData";

// Pure function tests only — Cache API is browser-only.
// The main getOfflinePageData() must be tested in-browser via debug tools.

test("isOfflinePageAvailable returns false for invalid page numbers", () => {
  assert.equal(isOfflinePageAvailable(0), false);
  assert.equal(isOfflinePageAvailable(-1), false);
  assert.equal(isOfflinePageAvailable(605), false);
  assert.equal(isOfflinePageAvailable(NaN), false);
});

test("isOfflinePageAvailable returns true for valid page numbers", () => {
  // These only validate the page number range, not cache state
  assert.equal(isOfflinePageAvailable(1), true);
  assert.equal(isOfflinePageAvailable(604), true);
  assert.equal(isOfflinePageAvailable(300), true);
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `npx tsx --test src/lib/pwa/offlinePageData.test.ts`

- [ ] **Step 3: Write offlinePageData module**

```typescript
// src/lib/pwa/offlinePageData.ts
import type { MushafPageManifest, MushafWordTranslationMap } from "@/types/mushaf";
import type { MushafLayoutPage } from "@/types/mushafLayout";
import { validatePageTranslations } from "./offlineTranslations";

const MIN_PAGE = 1;
const MAX_PAGE = 604;

export type OfflinePageResult =
  | {
      readonly available: true;
      readonly imageUrl: string;
      readonly manifest: MushafPageManifest;
      readonly layout: MushafLayoutPage;
      readonly translations: MushafWordTranslationMap;
    }
  | {
      readonly available: false;
      readonly reason: "not-downloaded" | "cache-miss" | "error" | "invalid-page";
    };

export function isOfflinePageAvailable(pageNumber: number): boolean {
  return (
    Number.isInteger(pageNumber) &&
    pageNumber >= MIN_PAGE &&
    pageNumber <= MAX_PAGE
  );
}

function pad3(n: number): string {
  return String(n).padStart(3, "0");
}

async function getCachedJson<T>(cacheName: string, url: string): Promise<T | null> {
  try {
    const cache = await caches.open(cacheName);
    const response = await cache.match(url);
    if (!response) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

async function getCachedImageUrl(cacheName: string, urlPattern: string): Promise<string | null> {
  try {
    const cache = await caches.open(cacheName);
    // Match any URL containing the page filename (version param may differ)
    const keys = await cache.keys();
    const match = keys.find((req) => req.url.includes(urlPattern));
    if (!match) return null;
    return match.url;
  } catch {
    return null;
  }
}

export async function getOfflinePageData(
  pageNumber: number,
): Promise<OfflinePageResult> {
  if (!isOfflinePageAvailable(pageNumber)) {
    return { available: false, reason: "invalid-page" };
  }

  const padded = pad3(pageNumber);
  const DATA_CACHE = "mushaf-data-v1";
  const IMAGES_CACHE = "mushaf-images-v1";

  try {
    // Check for cached image (URL includes version param, so match by filename)
    const imageUrl = await getCachedImageUrl(
      IMAGES_CACHE,
      `page_${padded}_mobile.webp`,
    );
    if (!imageUrl) {
      return { available: false, reason: "not-downloaded" };
    }

    // Load manifest, layout, and translations from data cache
    const [manifest, layout, rawTranslations] = await Promise.all([
      getCachedJson<MushafPageManifest>(
        DATA_CACHE,
        // Match by filename pattern in cached URLs
        await findCachedUrl(DATA_CACHE, `page_${padded}.manifest.json`),
      ),
      getCachedJson<MushafLayoutPage>(
        DATA_CACHE,
        `/layouts/page-${padded}.json`,
      ),
      getCachedJson<unknown>(
        DATA_CACHE,
        `/translations/page-${padded}.json`,
      ),
    ]);

    if (!manifest || !layout) {
      return { available: false, reason: "cache-miss" };
    }

    const translations = validatePageTranslations(rawTranslations);

    return {
      available: true,
      imageUrl,
      manifest,
      layout,
      translations,
    };
  } catch {
    return { available: false, reason: "error" };
  }
}

async function findCachedUrl(
  cacheName: string,
  filenamePattern: string,
): Promise<string> {
  try {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    const match = keys.find((req) => req.url.includes(filenamePattern));
    return match?.url ?? filenamePattern;
  } catch {
    return filenamePattern;
  }
}
```

- [ ] **Step 4: Run test — expect PASS**

Run: `npx tsx --test src/lib/pwa/offlinePageData.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/lib/pwa/offlinePageData.ts src/lib/pwa/offlinePageData.test.ts
git commit -m "feat(pwa): add offline page data module

KHA-30: Client-side module that reads mushaf page data from Cache API
for offline rendering. Checks cache directly by page number (not
surah ownership). Returns image URL, manifest, layout, and translations."
```

---

### Task 14: Offline detection hook

**Files:**
- Create: `src/lib/pwa/offlineDetection.ts`

React hook for online/offline state detection.

- [ ] **Step 1: Write the module**

```typescript
// src/lib/pwa/offlineDetection.ts
"use client";

import { useSyncExternalStore } from "react";

function getOnlineSnapshot(): boolean {
  return typeof navigator !== "undefined" ? navigator.onLine : true;
}

function getServerSnapshot(): boolean {
  return true; // Always online on server
}

function subscribeOnline(callback: () => void): () => void {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribeOnline, getOnlineSnapshot, getServerSnapshot);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/pwa/offlineDetection.ts
git commit -m "feat(pwa): add useOnlineStatus hook for offline detection

KHA-185: React hook using useSyncExternalStore to track online/offline
state. Returns true on server (SSR-safe)."
```

---

### Task 15: Offline indicator component

**Files:**
- Create: `src/components/OfflineIndicator.tsx`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Write the component**

```typescript
// src/components/OfflineIndicator.tsx
"use client";

import { useOnlineStatus } from "@/lib/pwa/offlineDetection";
import { useEffect, useState } from "react";

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();
  const [showReconnected, setShowReconnected] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    if (!isOnline) {
      setWasOffline(true);
    } else if (wasOffline) {
      setShowReconnected(true);
      const timer = setTimeout(() => {
        setShowReconnected(false);
        setWasOffline(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [isOnline, wasOffline]);

  if (isOnline && !showReconnected) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-0 left-0 right-0 z-50 text-center text-sm py-1 transition-colors duration-300"
      style={{
        backgroundColor: isOnline ? "#2d6a4f" : "#495057",
        color: "#ffffff",
      }}
    >
      {isOnline ? "Kembali dalam talian" : "Luar talian"}
    </div>
  );
}
```

- [ ] **Step 2: Add to layout.tsx**

Add `<OfflineIndicator />` to `layout.tsx` body, after `<ServiceWorkerRegistrar />`.

- [ ] **Step 3: Commit**

```bash
git add src/components/OfflineIndicator.tsx src/app/layout.tsx
git commit -m "feat(pwa): add offline status indicator banner

KHA-185: Calm, subtle banner at top of screen. Shows 'Luar talian'
when offline, brief 'Kembali dalam talian' on reconnect."
```

---

### Task 16: Update banner component

**Files:**
- Create: `src/components/UpdateBanner.tsx`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Write the component**

```typescript
// src/components/UpdateBanner.tsx
"use client";

import { useEffect, useState } from "react";
import { onSwUpdate, skipWaitingAndReload } from "@/lib/pwa/swRegistration";

export function UpdateBanner() {
  const [showUpdate, setShowUpdate] = useState(false);

  useEffect(() => {
    return onSwUpdate(() => setShowUpdate(true));
  }, []);

  if (!showUpdate) return null;

  return (
    <div
      role="alert"
      className="fixed bottom-4 left-4 right-4 z-50 flex items-center justify-between rounded-lg px-4 py-3 shadow-lg"
      style={{ backgroundColor: "#1a1a2e", color: "#ffffff" }}
    >
      <span className="text-sm">Versi baharu tersedia</span>
      <button
        type="button"
        onClick={skipWaitingAndReload}
        className="ml-4 rounded px-3 py-1 text-sm font-medium"
        style={{ backgroundColor: "#4a90d9", color: "#ffffff" }}
      >
        Kemas kini
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Add to layout.tsx**

Add `<UpdateBanner />` to `layout.tsx` body.

- [ ] **Step 3: Commit**

```bash
git add src/components/UpdateBanner.tsx src/app/layout.tsx
git commit -m "feat(pwa): add update banner for new SW versions

KHA-184: Non-intrusive bottom banner shows 'Versi baharu tersedia'
when a new SW is installed. User clicks 'Kemas kini' to activate
the new version and reload."
```

---

### Task 17: Reading state sync

**Files:**
- Create: `src/lib/pwa/readingStateSync.ts`
- Create: `src/app/api/reading/state/route.ts`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Write the sync module**

```typescript
// src/lib/pwa/readingStateSync.ts
"use client";

import { loadReadingProgress } from "@/lib/readingProgressStorage";

let syncSetUp = false;

async function flushReadingState(): Promise<void> {
  const state = loadReadingProgress();
  if (!state.lastPage) return;

  try {
    await fetch("/api/reading/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state),
    });
  } catch {
    // Will retry on next online event
  }
}

export function setupReadingStateSync(): void {
  if (typeof window === "undefined" || syncSetUp) return;
  syncSetUp = true;
  window.addEventListener("online", flushReadingState);
}
```

- [ ] **Step 2: Write the API route**

```typescript
// src/app/api/reading/state/route.ts
import { NextResponse } from "next/server";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { lastPage, lastReadAt, bookmarks } = body;

    if (!lastPage || typeof lastPage !== "number") {
      return NextResponse.json({ success: false }, { status: 400 });
    }

    // TODO: When auth is active, upsert to Supabase reading_progress table
    // For now, just acknowledge the sync
    console.log(`[Reading Sync] Page ${lastPage}, ${bookmarks?.length ?? 0} bookmarks`);

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
```

- [ ] **Step 3: Wire up in layout**

Create a component to call `setupReadingStateSync()`:

```typescript
// src/components/ReadingStateSync.tsx
"use client";

import { useEffect } from "react";
import { setupReadingStateSync } from "@/lib/pwa/readingStateSync";

export function ReadingStateSync() {
  useEffect(() => {
    setupReadingStateSync();
  }, []);
  return null;
}
```

Add `<ReadingStateSync />` to `layout.tsx` body.

- [ ] **Step 4: Commit**

```bash
git add src/lib/pwa/readingStateSync.ts src/app/api/reading/state/route.ts src/components/ReadingStateSync.tsx src/app/layout.tsx
git commit -m "feat(pwa): add reading state sync on reconnect

KHA-31: Flushes localStorage reading progress to server on 'online'
event. API route receives and logs the sync (Supabase upsert deferred
until auth is fully active). Last-writer-wins conflict resolution."
```

---

### Task 18: Offline fallback HTML shell

**Files:**
- Create: `public/offline.html`

A minimal static HTML page served by the SW when navigation fails offline. For v1, this is a simple message page — the full offline React app (esbuild bundle) is deferred to a follow-up task since it requires significant additional build infrastructure.

- [ ] **Step 1: Create the offline shell**

```html
<!-- public/offline.html -->
<!DOCTYPE html>
<html lang="ms" dir="ltr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="theme-color" content="#1a1a2e" />
  <title>Miftah — Luar Talian</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #1a1a2e;
      color: #e0e0e0;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 1.5rem;
    }
    .container {
      text-align: center;
      max-width: 400px;
    }
    .icon { font-size: 3rem; margin-bottom: 1rem; }
    h1 { font-size: 1.25rem; margin-bottom: 0.5rem; color: #ffffff; }
    p { font-size: 0.9rem; line-height: 1.5; color: #a0a0b0; margin-bottom: 1.5rem; }
    .retry-btn {
      display: inline-block;
      padding: 0.6rem 1.5rem;
      background: #4a90d9;
      color: #ffffff;
      border: none;
      border-radius: 8px;
      font-size: 0.9rem;
      cursor: pointer;
      text-decoration: none;
    }
    .retry-btn:hover { background: #357abd; }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">📖</div>
    <h1>Anda sedang luar talian</h1>
    <p>
      Muat turun surah untuk bacaan luar talian.
      Buka Miftah semasa dalam talian untuk muat turun.
    </p>
    <a href="/" class="retry-btn">Cuba semula</a>
  </div>
  <script>
    // If user comes back online while on this page, redirect to home
    window.addEventListener('online', function() {
      window.location.href = '/';
    });
  </script>
</body>
</html>
```

- [ ] **Step 2: Verify SW serves it**

Run: `npm run dev`
Open Chrome DevTools → Application → Service Workers → check "Offline"
Navigate to any page → should see the offline shell.
Uncheck "Offline" → page should auto-redirect to home.

- [ ] **Step 3: Commit**

```bash
git add public/offline.html
git commit -m "feat(pwa): add offline fallback HTML shell

KHA-28: Static offline page served by SW when navigation fails.
Shows calm BM message with retry button. Auto-redirects on reconnect.
Full offline reading app (esbuild bundle) planned as follow-up."
```

---

### Task 19: Build verification and integration test

**Files:**
- Modify: `package.json` (if needed)

Final integration pass: full build, verify all pieces work together.

- [ ] **Step 1: Run full build**

Run: `npm run build`
Expected: Build succeeds. No errors.

- [ ] **Step 2: Verify generated files**

```bash
ls public/translations/ | wc -l   # → 604
ls public/layouts/ | wc -l        # → 604
cat public/pwa-config.json         # → valid JSON with cdnAssetVersion
head -3 public/sw.js               # → BUILD_ID and CDN_ASSET_VERSION injected
ls public/icons/                   # → icon files present
ls public/offline.html             # → exists
```

- [ ] **Step 3: Lighthouse PWA audit**

Run: `npm run start` (production mode)
Open Chrome → Lighthouse → PWA audit.
Expected:
- ✅ Installable (manifest + SW)
- ✅ Service worker registered
- ✅ Offline fallback works

Note any failures and address them.

- [ ] **Step 4: Manual test — download and offline read**

1. `npm run dev`
2. Open browser console: `__miftahDebug.downloadSurah(1)`
3. Wait for download to complete
4. DevTools → Application → check "Offline"
5. Open DevTools → Cache Storage → verify `mushaf-images-v1` has page_001_mobile.webp
6. The full offline reading route integration (auto-rendering cached page) is for a follow-up task.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "chore(pwa): integration verification pass

Verified: full build succeeds, all prebuild scripts generate expected
output, SW registers and caches offline shell, Lighthouse PWA audit
passes, debug download tools work."
```

---

## Implementation Notes

### What this plan delivers

After completing all 19 tasks:
- ✅ Installable PWA (manifest, icons, meta tags)
- ✅ Service worker with multi-cache URL allowlist
- ✅ Build pipeline (6 prebuild scripts)
- ✅ IndexedDB pack manager + download engine
- ✅ Offline page data module (reads from Cache API)
- ✅ Dev-only download trigger for testing
- ✅ Offline status indicator banner
- ✅ App update banner with user-prompted activation
- ✅ Reading state sync on reconnect
- ✅ Offline fallback shell

### What needs follow-up tasks

- **Full offline reading route** — integrating `offlinePageData.ts` into the actual `/read/[page]` route component. Requires understanding the existing route's RSC/client component split.
- **Download UX components** — `DownloadManager.tsx`, `SurahDownloadButton.tsx`, `InstallPrompt.tsx` (KHA-183, KHA-185).
- **iOS eviction recovery** — canary check + re-download flow (KHA-187).
- **Offline reading renderer** — `OfflineMushafPageView` wrapper or direct `MushafPageView` usage with cached data.
- **esbuild offline bundle** — full React app in `offline.html` for rich offline experience (currently simple HTML).
- **QA hardening** — device testing matrix (KHA-32).

These follow-up items are best addressed once the foundation (this plan) is verified working.

