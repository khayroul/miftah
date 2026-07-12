# Offline Tema Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable the Tema (themes) feature to work fully offline by bundling tema data into the existing mushaf download and serving it via service worker.

**Architecture:** New API route `/api/tema/[surah]` aggregates chunk + WBW data per surah. The download engine gains a phase 2 that pre-fetches all 114 tema endpoints. The service worker intercepts browser-side fetches with cache-first strategy. The tema page switches from server-component data fetching to a client-side `TemaDataFetcher` component so the SW can intercept requests.

**Tech Stack:** Next.js App Router, Service Worker (Cache API), TypeScript, Supabase (existing queries), Zod (input validation)

**Spec:** `docs/superpowers/specs/2026-03-27-offline-tema-design.md`

---

## File Structure

| File | Role |
|------|------|
| `src/app/api/tema/[surah]/route.ts` | **Create** — API route returning tema chunks + WBW + prevSurahChunkCount |
| `src/components/ThemePageContent.tsx` | **Create** — Pure rendering component extracted from ThemePageContentAsync |
| `src/components/TemaDataFetcher.tsx` | **Create** — Client component that fetches `/api/tema/[surah]`, manages loading/error, renders ThemePageContent |
| `src/app/read/surah/[surah]/themes/page.tsx` | **Modify** — Mount TemaDataFetcher instead of ThemePageContentAsync |
| `src/lib/pwa/downloadEngine.ts` | **Modify** — Phase 2 tema download, composite version migration, fast-skip, progress rename, quota bump |
| `src/lib/pwa/mushafStatus.ts` | **Modify** — Composite version format, dual-version signature, tema cache counting |
| `src/components/MushafDownloadPrompt.tsx` | **Modify** — Percentage display, updated aria/copy, adapt to renamed progress fields |
| `src/lib/pwa/debugTools.ts` | **Modify** — Dual-version, tema cache cleanup |
| `public/sw.js` | **Modify** — TEMA_DATA_CACHE constant, matchesTemaData helper, cache-first routing, activate cleanup |
| `scripts/generate-pwa-config.ts` | **Modify** — Add temaDataVersion field |

---

## Chunk 0: Branch Setup

### Task 0: Create feature branch

- [ ] **Step 1: Create and switch to feature branch**

```bash
git checkout -b feat/offline-tema
```

---

## Chunk 1: API Route + Rendering Refactor

### Task 1: Create `/api/tema/[surah]` API route

**Files:**
- Create: `src/app/api/tema/[surah]/route.ts`

- [ ] **Step 1: Create the API route**

```typescript
import { NextResponse } from "next/server";
import {
  getThemeAppearanceChunksBySurah,
  getWordByWordForAyahIds,
  type ThemeAppearanceChunk,
  type AyahWordByWordEntry,
} from "@/lib/queries";

interface TemaApiResponse {
  readonly surahId: number;
  readonly chunks: ThemeAppearanceChunk[];
  readonly wbw: Record<number, AyahWordByWordEntry[]>;
  readonly prevSurahChunkCount: number | null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ surah: string }> },
): Promise<NextResponse> {
  const { surah } = await params;
  const surahId = Number.parseInt(surah, 10);

  if (!Number.isInteger(surahId) || surahId < 1 || surahId > 114) {
    return NextResponse.json(
      { error: "Invalid surah number (must be 1-114)" },
      { status: 400 },
    );
  }

  try {
    const chunks = await getThemeAppearanceChunksBySurah(surahId);

    // Collect all ayah IDs across all chunks for WBW
    const allAyahIds = chunks.flatMap((chunk) =>
      chunk.ayat.map((a) => a.id),
    );
    const wbw =
      allAyahIds.length > 0
        ? await getWordByWordForAyahIds(allAyahIds)
        : {};

    // Previous surah chunk count for cross-surah back navigation
    let prevSurahChunkCount: number | null = null;
    if (surahId > 1) {
      try {
        const prevChunks = await getThemeAppearanceChunksBySurah(
          surahId - 1,
        );
        prevSurahChunkCount =
          prevChunks.length > 0 ? prevChunks.length : null;
      } catch {
        // Non-critical — fall back to no cross-surah link
      }
    }

    const response: TemaApiResponse = {
      surahId,
      chunks,
      wbw,
      prevSurahChunkCount,
    };

    return NextResponse.json(response, {
      headers: { "Cache-Control": "no-transform" },
    });
  } catch (error) {
    console.error(`Failed to load tema for surah ${surahId}:`, error);
    return NextResponse.json(
      { error: "Failed to load tema data" },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: Verify the route builds**

Run: `npm run build`
Expected: Build succeeds with no errors related to the new route.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/tema/\[surah\]/route.ts
git commit -m "feat: add /api/tema/[surah] API route for offline tema support"
```

---

### Task 2: Extract ThemePageContent pure rendering component

**Files:**
- Create: `src/components/ThemePageContent.tsx`
- Modify: `src/components/ThemePageContentAsync.tsx` (verify shared helpers remain importable)

The goal is to extract the rendering logic from `ThemePageContentAsync` into a props-driven component. The helper functions (`buildThemeHref`, `rangeLabel`, `chunkTitleBm`, `truncateText`, `buildThemeSynopsis`) stay in the new file since they're only used for rendering.

- [ ] **Step 1: Create ThemePageContent.tsx**

Extract lines 20-331 from `ThemePageContentAsync.tsx` into a new file. The component receives pre-computed data as props instead of fetching:

```typescript
import Link from "next/link";
import { FahamExposureTracker } from "@/components/FahamExposureTracker";
import { ThemeActionPanel } from "@/components/ThemeActionPanel";
import { ThemeChunkAyahList } from "@/components/ThemeChunkAyahList";
import { ThemeChunkProgressTracker } from "@/components/ThemeChunkProgressTracker";
import { ThemeChunkSelect } from "@/components/ThemeChunkSelect";
import { ThemeJumpControls } from "@/components/ThemeJumpControls";
import { resolveThemeChunkLabelBm } from "@/lib/themeLabels";
import type { Surah } from "@/types/database";
import type { AyahWordByWordEntry, ThemeAppearanceChunk } from "@/lib/queries";

export interface ThemePageContentProps {
  readonly surahNumber: number;
  readonly surahMeta: Surah;
  readonly allSurahs: Surah[];
  readonly chunks: ThemeAppearanceChunk[];
  readonly wbw: Record<number, AyahWordByWordEntry[]>;
  readonly selectedChunkIndex: number;
  readonly prevSurahChunkCount: number | null;
}

// Move all helper functions here: buildThemeHref, rangeLabel, chunkTitleBm,
// truncateText, buildThemeSynopsis — unchanged from ThemePageContentAsync.tsx

export function ThemePageContent({
  surahNumber,
  surahMeta,
  allSurahs,
  chunks,
  wbw,
  selectedChunkIndex,
  prevSurahChunkCount,
}: ThemePageContentProps) {
  // Same rendering logic as ThemePageContentAsync lines 130-331,
  // but uses props instead of fetched data.
  // Compute: selectedChunk, hasNextThemeInSurah, isFirstChunkInSurah,
  // previousThemeHref, nextThemeHref, selectedChunkSynopsis, wbwByAyahId
  // (filter wbw to selected chunk's ayah IDs)

  const surahOptions = allSurahs.map((item) => ({
    surah: item.id,
    nameBm: item.name_bm,
    nameEn: item.name_en,
  }));

  const selectedChunk = chunks[selectedChunkIndex - 1] ?? null;
  const hasNextThemeInSurah = selectedChunkIndex < chunks.length;
  const isFirstChunkInSurah = selectedChunkIndex <= 1;

  const nextSurah =
    !hasNextThemeInSurah && surahNumber < 114
      ? allSurahs.find((s) => s.id === surahNumber + 1)
      : null;

  const prevSurahNumber =
    isFirstChunkInSurah && surahNumber > 1 ? surahNumber - 1 : null;

  const previousThemeHref =
    chunks.length > 0 && selectedChunkIndex > 1
      ? buildThemeHref(surahNumber, selectedChunkIndex - 1)
      : prevSurahChunkCount !== null && prevSurahNumber !== null
        ? buildThemeHref(prevSurahNumber, prevSurahChunkCount)
        : null;

  const nextThemeHref = hasNextThemeInSurah
    ? buildThemeHref(surahNumber, selectedChunkIndex + 1)
    : nextSurah
      ? buildThemeHref(nextSurah.id, 1)
      : null;

  const selectedChunkSynopsis = selectedChunk
    ? buildThemeSynopsis(selectedChunk)
    : null;

  // Extract WBW for selected chunk's ayah IDs only
  const wbwByAyahId: Record<number, AyahWordByWordEntry[]> = selectedChunk
    ? Object.fromEntries(
        selectedChunk.ayat
          .map((a) => [a.id, wbw[a.id] ?? []] as const)
          .filter(([, entries]) => entries.length > 0),
      )
    : {};

  // Return JSX — identical to ThemePageContentAsync lines 201-331
  return (
    <>
      {/* ... identical JSX from ThemePageContentAsync ... */}
    </>
  );
}
```

The full JSX body is copied verbatim from `ThemePageContentAsync.tsx` lines 201-331. The only change is that `wbwByAyahId` is computed from the `wbw` prop filtered to the selected chunk's ayah IDs, and `prevSurahLastChunkCount` comes from the `prevSurahChunkCount` prop.

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds. `ThemePageContent.tsx` has no `"use client"` directive (pure props-driven rendering). It will be bundled as client code at runtime since `TemaDataFetcher` imports it.

- [ ] **Step 3: Commit**

```bash
git add src/components/ThemePageContent.tsx
git commit -m "refactor: extract ThemePageContent pure rendering component from ThemePageContentAsync"
```

---

### Task 3: Create TemaDataFetcher client component

**Files:**
- Create: `src/components/TemaDataFetcher.tsx`

- [ ] **Step 1: Create TemaDataFetcher.tsx**

```typescript
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ThemePageContent } from "@/components/ThemePageContent";
import type { Surah } from "@/types/database";
import type { AyahWordByWordEntry, ThemeAppearanceChunk } from "@/lib/queries";

interface TemaApiResponse {
  readonly surahId: number;
  readonly chunks: ThemeAppearanceChunk[];
  readonly wbw: Record<number, AyahWordByWordEntry[]>;
  readonly prevSurahChunkCount: number | null;
}

interface TemaDataFetcherProps {
  readonly surahNumber: number;
  readonly surahMeta: Surah;
  readonly allSurahs: Surah[];
}

type FetchState =
  | { readonly kind: "loading" }
  | { readonly kind: "loaded"; readonly data: TemaApiResponse }
  | { readonly kind: "error"; readonly message: string };

export function TemaDataFetcher({
  surahNumber,
  surahMeta,
  allSurahs,
}: TemaDataFetcherProps) {
  const searchParams = useSearchParams();
  const [state, setState] = useState<FetchState>({ kind: "loading" });
  const cacheRef = useRef<{ surah: number; data: TemaApiResponse } | null>(
    null,
  );

  const fetchTema = useCallback(async (surah: number) => {
    // Return cached data if same surah
    if (cacheRef.current?.surah === surah) {
      setState({ kind: "loaded", data: cacheRef.current.data });
      return;
    }

    setState({ kind: "loading" });

    try {
      const response = await fetch(`/api/tema/${surah}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data: TemaApiResponse = await response.json();
      cacheRef.current = { surah, data };
      setState({ kind: "loaded", data });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Gagal memuatkan tema";
      setState({ kind: "error", message });
    }
  }, []);

  useEffect(() => {
    fetchTema(surahNumber);
  }, [surahNumber, fetchTema]);

  const handleRetry = useCallback(() => {
    cacheRef.current = null;
    fetchTema(surahNumber);
  }, [surahNumber, fetchTema]);

  // Compute selectedChunkIndex from URL param
  const rawChunk = searchParams.get("chunk");
  const parsedChunk = rawChunk ? Number.parseInt(rawChunk, 10) : 1;

  if (state.kind === "loading") {
    return (
      <section
        className="rounded-2xl border border-stone-200/85 bg-white/92 p-5 shadow-[0_28px_80px_-52px_rgba(28,25,23,0.18)] dark:border-stone-700/80 dark:bg-stone-900/88 sm:p-6"
        aria-busy="true"
        aria-label="Memuatkan tema..."
      >
        <div className="h-5 w-32 animate-pulse rounded-full bg-stone-200 dark:bg-stone-800" />
        <div className="mt-4 h-9 w-3/4 animate-pulse rounded-2xl bg-stone-200 dark:bg-stone-800" />
        <div className="mt-3 h-4 w-40 animate-pulse rounded-full bg-stone-200 dark:bg-stone-800" />
        <div className="mt-6 h-48 animate-pulse rounded-[1.5rem] bg-stone-100 dark:bg-stone-800/80" />
      </section>
    );
  }

  if (state.kind === "error") {
    return (
      <section className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-400">
        <p>Tema tidak dapat dimuatkan.</p>
        <button
          onClick={handleRetry}
          className="mt-2 rounded-lg bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700"
        >
          Cuba semula
        </button>
      </section>
    );
  }

  const { chunks, wbw, prevSurahChunkCount } = state.data;
  const selectedChunkIndex =
    chunks.length > 0
      ? Number.isInteger(parsedChunk)
        ? Math.min(Math.max(parsedChunk, 1), chunks.length)
        : 1
      : 1;

  return (
    <ThemePageContent
      surahNumber={surahNumber}
      surahMeta={surahMeta}
      allSurahs={allSurahs}
      chunks={chunks}
      wbw={wbw}
      selectedChunkIndex={selectedChunkIndex}
      prevSurahChunkCount={prevSurahChunkCount}
    />
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds. `TemaDataFetcher` compiles as a client component.

- [ ] **Step 3: Commit**

```bash
git add src/components/TemaDataFetcher.tsx
git commit -m "feat: add TemaDataFetcher client component for offline-capable tema fetching"
```

---

### Task 4: Wire up page.tsx and clean up ThemePageContentAsync

**Files:**
- Modify: `src/app/read/surah/[surah]/themes/page.tsx`
- Delete or deprecate: `src/components/ThemePageContentAsync.tsx` (can be deleted after migration)

- [ ] **Step 1: Update page.tsx to mount TemaDataFetcher**

In `src/app/read/surah/[surah]/themes/page.tsx`:

Replace the import:
```typescript
// OLD
import { ThemePageContentAsync } from "@/components/ThemePageContentAsync";
// NEW
import { TemaDataFetcher } from "@/components/TemaDataFetcher";
```

Replace the Suspense + ThemePageContentAsync block (lines 95-102) with a direct mount of `TemaDataFetcher`. Since `TemaDataFetcher` is a client component that manages its own loading state, the `Suspense` boundary and `ThemePageContentFallback` are no longer needed — remove both:

```typescript
// OLD
<Suspense fallback={<ThemePageContentFallback />}>
  <ThemePageContentAsync
    rawChunkParam={query.chunk}
    surahMeta={surahMeta}
    surahNumber={surahNumber}
    allSurahs={allSurahs}
  />
</Suspense>

// NEW (no Suspense wrapper — TemaDataFetcher has its own loading skeleton)
<TemaDataFetcher
  surahNumber={surahNumber}
  surahMeta={surahMeta}
  allSurahs={allSurahs}
/>
```

Also delete the `ThemePageContentFallback` function (lines 21-43) and the `Suspense` import since they are now unused.

Remove `searchParams` from the page props since `TemaDataFetcher` reads chunk param via `useSearchParams()`:

```typescript
// OLD
interface SurahThemeAppearancePageProps {
  params: Promise<{ surah: string }>;
  searchParams: Promise<{ chunk?: string | string[] }>;
}
// ...
const query = await searchParams;

// NEW
interface SurahThemeAppearancePageProps {
  params: Promise<{ surah: string }>;
}
// Remove: const query = await searchParams;
```

- [ ] **Step 2: Delete ThemePageContentAsync.tsx**

```bash
rm src/components/ThemePageContentAsync.tsx
```

Verify no other files import it:

Run: `grep -r "ThemePageContentAsync" src/`
Expected: No results.

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds. Tema pages render with the new client-side fetching flow.

- [ ] **Step 4: Commit**

```bash
git add src/app/read/surah/\[surah\]/themes/page.tsx src/components/TemaDataFetcher.tsx
git rm src/components/ThemePageContentAsync.tsx
git commit -m "refactor: switch tema page to client-side TemaDataFetcher for offline support"
```

---

## Chunk 2: Service Worker + PWA Config

### Task 5: Add temaDataVersion to pwa-config generation

**Files:**
- Modify: `scripts/generate-pwa-config.ts`
- Modify: `src/lib/pwa/downloadEngine.ts` (PwaConfig interface + isPwaConfig guard)

- [ ] **Step 1: Update generate-pwa-config.ts**

In `scripts/generate-pwa-config.ts`, add `temaDataVersion` to the config output.

Add after line 21 (`const manifestsBucket = ...`):
```typescript
const temaDataVersion = process.env.TEMA_DATA_VERSION?.trim() || "1";
```

Update the config object (line 26):
```typescript
// OLD
const config = { cdnAssetVersion: cdnVersion, supabaseStorageBase: storageBase, pagesBucket, manifestsBucket };
// NEW
const config = { cdnAssetVersion: cdnVersion, temaDataVersion, supabaseStorageBase: storageBase, pagesBucket, manifestsBucket };
```

Update the log line:
```typescript
console.log(`Generated ${OUTPUT_PATH} (version: ${cdnVersion}, tema: ${temaDataVersion})`);
```

- [ ] **Step 2: Update PwaConfig interface and guard in downloadEngine.ts**

In `src/lib/pwa/downloadEngine.ts`:

Update the interface (lines 12-17):
```typescript
// OLD
export interface PwaConfig {
  readonly cdnAssetVersion: string;
  readonly supabaseStorageBase: string;
  readonly pagesBucket: string;
  readonly manifestsBucket: string;
}

// NEW
export interface PwaConfig {
  readonly cdnAssetVersion: string;
  readonly temaDataVersion?: string;
  readonly supabaseStorageBase: string;
  readonly pagesBucket: string;
  readonly manifestsBucket: string;
}
```

The `isPwaConfig` guard (lines 43-52) stays unchanged — `temaDataVersion` is optional, so the guard doesn't need to check for it.

- [ ] **Step 3: Verify prebuild generates correct config**

Run: `npm run prebuild:pwa-config`
Then: `cat public/pwa-config.json`
Expected: JSON includes `"temaDataVersion": "1"`.

- [ ] **Step 4: Commit**

```bash
git add scripts/generate-pwa-config.ts src/lib/pwa/downloadEngine.ts
git commit -m "feat: add temaDataVersion to pwa-config.json and PwaConfig interface"
```

---

### Task 6: Add tema cache routing to service worker

**Files:**
- Modify: `public/sw.js`

- [ ] **Step 1: Add TEMA_DATA_CACHE constant and matcher**

In `public/sw.js`, after line 9 (`const AUDIO_CACHE = ...`), add:
```javascript
const TEMA_DATA_CACHE = "tema-data-v1";
```

After `matchesAudio` function (line 65), add:
```javascript
function matchesTemaData(url) {
  return url.pathname.startsWith("/api/tema/");
}
```

- [ ] **Step 2: Add cache-first routing for tema data**

In the fetch handler, after the audio block (line 133) and before the closing comment, add:
```javascript
  // Tema data
  if (matchesTemaData(url)) {
    event.respondWith(cacheFirstTema(event.request));
    return;
  }
```

Add the `cacheFirstTema` function after `cacheFirstStrategy` (line 81):
```javascript
async function cacheFirstTema(request) {
  const cache = await caches.open(TEMA_DATA_CACHE);
  const cached = await cache.match(request, { ignoreVary: true });
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    return new Response(JSON.stringify({ error: "Offline" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }
}
```

- [ ] **Step 3: Add tema cache cleanup to activate handler**

Update the activate handler (lines 22-32) to also clean old tema caches:
```javascript
// OLD filter
keys.filter((key) => key.startsWith("app-shell-") && key !== APP_SHELL_CACHE)

// NEW filter
keys.filter(
  (key) =>
    (key.startsWith("app-shell-") && key !== APP_SHELL_CACHE) ||
    (key.startsWith("tema-data-") && key !== TEMA_DATA_CACHE)
)
```

- [ ] **Step 4: Verify build (sw.js is static, just check syntax)**

Run: `node -c public/sw.js`
Expected: No syntax errors.

- [ ] **Step 5: Commit**

```bash
git add public/sw.js
git commit -m "feat: add tema-data-v1 cache routing in service worker with ignoreVary"
```

---

## Chunk 3: Download Engine + Status Tracking

### Task 7: Update mushafStatus.ts for composite version format

> **Note:** Tasks 7-10 form an atomic unit — the build will be temporarily broken after Task 7 until Tasks 8-10 update all callers. Do not run `npm run build` until after Task 10. Run only the specific test file in Step 4.

**Files:**
- Modify: `src/lib/pwa/mushafStatus.ts`
- Modify: `src/lib/pwa/mushafStatus.test.ts`

- [ ] **Step 1: Write tests for the new composite version behavior**

Add tests to `src/lib/pwa/mushafStatus.test.ts`:

```typescript
describe("markMushafDownloaded with composite version", () => {
  beforeEach(() => {
    mockLocalStorage.clear();
  });

  it("stores composite format cdnVersion:temaVersion", () => {
    markMushafDownloaded("4", "1");
    assert.equal(store["miftah:mushaf-downloaded"], "4:1");
  });
});
```

Update the existing test at line 52-54:
```typescript
// OLD
it("sets and reads the downloaded version", () => {
  markMushafDownloaded("5");
  assert.equal(store["miftah:mushaf-downloaded"], "5");
});
// NEW
it("sets and reads the downloaded version", () => {
  markMushafDownloaded("5", "1");
  assert.equal(store["miftah:mushaf-downloaded"], "5:1");
});
```

Update the existing test at line 57-63:
```typescript
// OLD
clearMushafDownloaded();
// NEW (same, clearMushafDownloaded signature unchanged)
clearMushafDownloaded();
```

- [ ] **Step 2: Run tests — should FAIL**

Run: `tsx --test src/lib/pwa/mushafStatus.test.ts`
Expected: FAIL because `markMushafDownloaded` still takes 1 argument.

- [ ] **Step 3: Update mushafStatus.ts**

Update `MushafStatus` type (line 11-14):
```typescript
// OLD
export type MushafStatus =
  | { readonly state: "complete" }
  | { readonly state: "partial"; readonly downloadedPages: number }
  | { readonly state: "none" };

// NEW
export type MushafStatus =
  | { readonly state: "complete" }
  | { readonly state: "partial"; readonly completedItems: number }
  | { readonly state: "none" };
```

Update `TOTAL_ITEMS` constant:
```typescript
// After existing constants (line 8-9)
export const TOTAL_PAGES = 604;
const TOTAL_DATA_ENTRIES = TOTAL_PAGES * 3;
const TOTAL_TEMA_ENTRIES = 114;
export const TOTAL_ITEMS = TOTAL_PAGES + TOTAL_TEMA_ENTRIES; // 718
const CACHE_TEMA = "tema-data-v1";
```

Update `isMushafDownloaded` signature and logic:
```typescript
export async function isMushafDownloaded(
  cdnAssetVersion: string,
  temaDataVersion: string,
): Promise<MushafStatus> {
  const compositeVersion = `${cdnAssetVersion}:${temaDataVersion}`;

  // Fast path
  const stored = localStorage.getItem(LS_KEY_DOWNLOADED);
  if (stored === compositeVersion) {
    return { state: "complete" };
  }

  // Slow path — count cache entries
  try {
    const imageCache = await caches.open(CACHE_IMAGES);
    const imageKeys = await imageCache.keys();
    const webpCount = imageKeys.filter((r) =>
      r.url.includes("_mobile.webp"),
    ).length;

    // Count tema cache entries
    const temaCache = await caches.open(CACHE_TEMA);
    const temaKeys = await temaCache.keys();
    const temaCount = temaKeys.length;

    if (webpCount === 0 && temaCount === 0) {
      return { state: "none" };
    }

    if (webpCount >= TOTAL_PAGES && temaCount >= TOTAL_TEMA_ENTRIES) {
      const dataCache = await caches.open(CACHE_DATA);
      const dataKeys = await dataCache.keys();
      if (dataKeys.length >= TOTAL_DATA_ENTRIES) {
        markMushafDownloaded(cdnAssetVersion, temaDataVersion);
        return { state: "complete" };
      }
    }

    return { state: "partial", completedItems: webpCount + temaCount };
  } catch {
    return { state: "none" };
  }
}
```

Update `markMushafDownloaded`:
```typescript
export function markMushafDownloaded(
  cdnAssetVersion: string,
  temaDataVersion: string,
): void {
  localStorage.setItem(
    LS_KEY_DOWNLOADED,
    `${cdnAssetVersion}:${temaDataVersion}`,
  );
}
```

- [ ] **Step 4: Run tests — should PASS**

Run: `tsx --test src/lib/pwa/mushafStatus.test.ts`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pwa/mushafStatus.ts src/lib/pwa/mushafStatus.test.ts
git commit -m "feat: composite version format and tema cache counting in mushafStatus"
```

---

### Task 8: Update downloadEngine.ts for phase 2 + migration

**Files:**
- Modify: `src/lib/pwa/downloadEngine.ts`

- [ ] **Step 1: Update progress type and constants**

```typescript
// OLD (lines 89-94)
export type MushafDownloadProgress = {
  readonly downloadedPages: number;
  readonly totalPages: number;
};
type ProgressCallback = (progress: MushafDownloadProgress) => void;

// NEW
export type MushafDownloadProgress = {
  readonly completedItems: number;
  readonly totalItems: number;
};
type ProgressCallback = (progress: MushafDownloadProgress) => void;
```

Add tema cache constant after line 101:
```typescript
const CACHE_TEMA = "tema-data-v1";
```

Update quota constant:
```typescript
// OLD (line 181)
const REQUIRED_BYTES = 150_000_000;
// NEW
const REQUIRED_BYTES = 200_000_000; // ~200 MB (mushaf + tema + WBW)
```

- [ ] **Step 2: Rewrite migrateIfVersionChanged for composite format**

```typescript
async function migrateIfVersionChanged(
  cdnAssetVersion: string,
  temaDataVersion: string,
): Promise<void> {
  const stored = localStorage.getItem(LS_KEY_DOWNLOADED);
  if (stored === null) return;

  const compositeVersion = `${cdnAssetVersion}:${temaDataVersion}`;
  if (stored === compositeVersion) return;

  // Parse stored value
  const colonIndex = stored.indexOf(":");
  const storedCdn = colonIndex >= 0 ? stored.slice(0, colonIndex) : stored;
  const storedTema = colonIndex >= 0 ? stored.slice(colonIndex + 1) : "";

  if (storedCdn !== cdnAssetVersion) {
    await caches.delete(CACHE_IMAGES);
    await caches.delete(CACHE_DATA);
  }

  if (storedTema !== temaDataVersion) {
    await caches.delete(CACHE_TEMA);
  }

  clearMushafDownloaded();
}
```

- [ ] **Step 3: Add phase 2 tema download to downloadMushaf**

Import `TOTAL_ITEMS` from mushafStatus:
```typescript
import {
  TOTAL_PAGES,
  TOTAL_ITEMS,
  LS_KEY_DOWNLOADED,
  markMushafDownloaded,
  clearMushafDownloaded,
} from "./mushafStatus";
```

Rewrite `downloadMushaf`:
```typescript
export async function downloadMushaf(
  config: PwaConfig,
  onProgress?: ProgressCallback,
): Promise<void> {
  if (isDownloading) return;
  isDownloading = true;

  const controller = new AbortController();
  activeController = controller;

  try {
    const temaDataVersion = config.temaDataVersion ?? "1";
    await migrateIfVersionChanged(config.cdnAssetVersion, temaDataVersion);

    const hasQuota = await checkStorageQuota();
    if (!hasQuota) {
      throw new Error(
        "Ruang storan tidak mencukupi (~200 MB diperlukan)",
      );
    }
    await requestPersistentStorage();

    let completedItems = 0;

    // Phase 1: Mushaf pages — fast-skip if all images already cached
    const imageCache = await caches.open(CACHE_IMAGES);
    const imageKeys = await imageCache.keys();
    const cachedImageCount = imageKeys.filter((r) =>
      r.url.includes("_mobile.webp"),
    ).length;

    if (cachedImageCount >= TOTAL_PAGES) {
      // All pages cached — skip phase 1 entirely
      completedItems = TOTAL_PAGES;
      onProgress?.({ completedItems, totalItems: TOTAL_ITEMS });
    } else {
      for (let page = 1; page <= TOTAL_PAGES; page += 2) {
        if (controller.signal.aborted) break;

        const batch: Promise<void>[] = [
          downloadPage(page, config, controller),
        ];
        if (page + 1 <= TOTAL_PAGES) {
          batch.push(downloadPage(page + 1, config, controller));
        }

        await Promise.all(batch);

        const pagesInBatch = page + 1 <= TOTAL_PAGES ? 2 : 1;
        completedItems += pagesInBatch;

        onProgress?.({ completedItems, totalItems: TOTAL_ITEMS });
      }
    }

    // Phase 2: Tema data (114 surahs)
    if (config.temaDataVersion) {
      for (let surah = 1; surah <= 114; surah += 2) {
        if (controller.signal.aborted) break;

        const batch: Promise<void>[] = [
          fetchAndCacheWithRetry(
            `/api/tema/${surah}`,
            CACHE_TEMA,
            controller,
          ),
        ];
        if (surah + 1 <= 114) {
          batch.push(
            fetchAndCacheWithRetry(
              `/api/tema/${surah + 1}`,
              CACHE_TEMA,
              controller,
            ),
          );
        }

        await Promise.all(batch);

        const surahsInBatch = surah + 1 <= 114 ? 2 : 1;
        completedItems += surahsInBatch;

        onProgress?.({ completedItems, totalItems: TOTAL_ITEMS });
      }
    }

    if (!controller.signal.aborted) {
      markMushafDownloaded(config.cdnAssetVersion, temaDataVersion);
    }
  } catch (error) {
    if (
      error instanceof DOMException &&
      error.name === "QuotaExceededError"
    ) {
      throw new Error(
        "Ruang storan tidak mencukupi (~200 MB diperlukan)",
      );
    }
    throw error;
  } finally {
    isDownloading = false;
    if (activeController === controller) {
      activeController = null;
    }
  }
}
```

- [ ] **Step 4: Commit** (build will pass after Tasks 9-10 complete)

```bash
git add src/lib/pwa/downloadEngine.ts
git commit -m "feat: phase 2 tema download, composite migration, fast-skip, 200MB quota"
```

---

### Task 9: Update MushafDownloadPrompt for percentage display

**Files:**
- Modify: `src/components/MushafDownloadPrompt.tsx`

- [ ] **Step 1: Update imports and types**

```typescript
// OLD imports
import {
  type MushafStatus,
  isMushafDownloaded,
  hasUserStartedDownload,
  setDownloadStarted,
  isPromptDismissed,
  dismissPrompt,
  TOTAL_PAGES,
} from "@/lib/pwa/mushafStatus";

// NEW imports
import {
  type MushafStatus,
  isMushafDownloaded,
  hasUserStartedDownload,
  setDownloadStarted,
  isPromptDismissed,
  dismissPrompt,
  TOTAL_ITEMS,
} from "@/lib/pwa/mushafStatus";
```

- [ ] **Step 2: Update UIState type**

```typescript
// OLD
| { readonly kind: "downloading"; readonly downloadedPages: number }
// NEW
| { readonly kind: "downloading"; readonly completedItems: number }
```

- [ ] **Step 3: Update all references to progress fields**

In `startDownload` callback:
```typescript
// OLD
setUi({ kind: "downloading", downloadedPages: progress.downloadedPages });
// NEW
setUi({ kind: "downloading", completedItems: progress.completedItems });
```

In `check()` function — update `isMushafDownloaded` call:
```typescript
// OLD
const status: MushafStatus = await isMushafDownloaded(config.cdnAssetVersion);
// NEW
const status: MushafStatus = await isMushafDownloaded(
  config.cdnAssetVersion,
  config.temaDataVersion ?? "1",
);
```

In auto-resume block:
```typescript
// OLD
setUi({ kind: "downloading", downloadedPages: status.downloadedPages });
// NEW
setUi({ kind: "downloading", completedItems: status.completedItems });
```

In `handleStart`:
```typescript
// OLD
setUi({ kind: "downloading", downloadedPages: 0 });
// NEW
setUi({ kind: "downloading", completedItems: 0 });
```

In `handleRetry`:
```typescript
// OLD
setUi({ kind: "downloading", downloadedPages: 0 });
// NEW
setUi({ kind: "downloading", completedItems: 0 });
```

- [ ] **Step 4: Update prompt copy**

In the prompt card (line 160):
```typescript
// OLD
Muat turun Mushaf untuk bacaan luar talian (~120 MB)
// NEW
Muat turun Mushaf dan Tema untuk bacaan luar talian (~170 MB)
```

- [ ] **Step 5: Update progress bar rendering**

In minimized FAB:
```typescript
// OLD
{Math.round((ui.downloadedPages / TOTAL_PAGES) * 100)}%
// NEW
{Math.round((ui.completedItems / TOTAL_ITEMS) * 100)}%
```

In expanded progress bar:
```typescript
// OLD
const percentage = (ui.downloadedPages / TOTAL_PAGES) * 100;
// NEW
const percentage = (ui.completedItems / TOTAL_ITEMS) * 100;
```

Update aria attributes:
```typescript
// OLD
aria-valuenow={ui.downloadedPages}
aria-valuemax={TOTAL_PAGES}
aria-label="Memuat turun Mushaf"
// NEW
aria-valuenow={ui.completedItems}
aria-valuemax={TOTAL_ITEMS}
aria-label="Memuat turun data Miftah"
```

Update progress text display:
```typescript
// OLD
{ui.downloadedPages}/{TOTAL_PAGES} halaman
// NEW
{Math.round(percentage)}%
```

- [ ] **Step 6: Update completion message**

```typescript
// OLD
Mushaf sedia luar talian ✓
// NEW
Mushaf dan Tema sedia luar talian ✓
```

- [ ] **Step 7: Commit** (build will pass after Task 10)

```bash
git add src/components/MushafDownloadPrompt.tsx
git commit -m "feat: percentage progress display, updated copy for tema download"
```

---

### Task 10: Update debugTools.ts

**Files:**
- Modify: `src/lib/pwa/debugTools.ts`

- [ ] **Step 1: Update debugTools**

```typescript
// Update mushafStatus() to pass both versions:
async mushafStatus() {
  const config = await loadPwaConfig();
  const status = await isMushafDownloaded(
    config.cdnAssetVersion,
    config.temaDataVersion ?? "1",
  );
  console.log("[PWA Debug] Mushaf status:", status);
  return status;
},

// Update clearDownload() to also delete tema cache:
async clearDownload() {
  clearMushafDownloaded();
  await caches.delete("mushaf-images-v1");
  await caches.delete("mushaf-data-v1");
  await caches.delete("tema-data-v1");
  console.log("[PWA Debug] Download cleared (localStorage + caches).");
},

// Update downloadMushaf progress log:
async downloadMushaf() {
  const config = await loadPwaConfig();
  console.log("[PWA Debug] Downloading full mushaf + tema...");
  await downloadMushaf(config, (progress) => {
    console.log(
      `[PWA Debug] ${progress.completedItems}/${progress.totalItems} items`,
    );
  });
  console.log("[PWA Debug] Done.");
},
```

- [ ] **Step 2: Verify build (covers Tasks 7-10)**

Run: `npm run build`
Expected: Build succeeds — all callers now use the updated signatures.

- [ ] **Step 3: Commit**

```bash
git add src/lib/pwa/debugTools.ts
git commit -m "feat: update debug tools for dual-version status and tema cache cleanup"
```

---

## Chunk 4: Integration Verification

### Task 11: Run full test suite and build

- [ ] **Step 1: Run existing PWA tests**

Run: `npm run test:pwa`
Expected: All tests pass. Some tests may need updates for the renamed `downloadedPages` → `completedItems` in `MushafStatus` type — fix any failures.

- [ ] **Step 2: Run full build**

Run: `npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 3: Fix any test or build failures**

Address each failure, re-run affected tests, verify green.

- [ ] **Step 4: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: address test/build issues from offline tema changes"
```

---

### Task 12: Create PR

- [ ] **Step 1: Push branch and create PR**

```bash
git push -u origin feat/offline-tema
gh pr create --title "feat: offline tema support" --body "$(cat <<'EOF'
## Summary

- New `/api/tema/[surah]` API route aggregating chunks + WBW + prevSurahChunkCount
- Refactored tema page: server shell + client `TemaDataFetcher` (enables SW interception)
- Service worker `tema-data-v1` cache with `ignoreVary` cache-first strategy
- Download engine phase 2: downloads 114 tema endpoints after mushaf pages
- Composite version format (`cdnAssetVersion:temaDataVersion`) for independent invalidation
- Fast-skip phase 1 for existing users (cache count check)
- Progress display updated to percentage (718 total items)
- Storage quota bumped to 200 MB
- Existing users auto-resume to download tema silently

## Test plan

- [ ] Fresh install: download prompt shows ~170 MB, progress bar shows percentage
- [ ] Full download completes both phases (604 pages + 114 tema)
- [ ] After download, go offline → tema pages load from cache
- [ ] Existing mushaf-only users see auto-resume downloading tema (~84% start)
- [ ] Cross-surah navigation works offline (prevSurahChunkCount in API response)
- [ ] Chunk switching within surah is instant (no re-fetch)
- [ ] Debug tools: `__miftahDebug.mushafStatus()` shows correct composite state
- [ ] Debug tools: `__miftahDebug.clearDownload()` clears all 3 caches
- [ ] Version bump `temaDataVersion` triggers tema-only cache invalidation
- [ ] iOS PWA: tema works offline when launched from home screen
- [ ] `npm run build` passes
- [ ] `npm run test:pwa` passes

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 2: Verify PR created**

Expected: PR URL returned successfully.
