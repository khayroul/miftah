# Full Mushaf Download — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace per-surah download engine with a one-time full-mushaf download (~120 MB, 604 pages) triggered from the home page, with auto-resume on interruption.

**Architecture:** New `mushafStatus.ts` module tracks download state via localStorage fast-path + Cache API slow-path. Rewritten `downloadEngine.ts` replaces `downloadSurah()` with `downloadMushaf()` that batches 2 pages in parallel (8 concurrent fetches). New `MushafDownloadPrompt` component in layout provides prompt card on home + persistent progress bar during download.

**Tech Stack:** Next.js 16 App Router, TypeScript, Cache API, localStorage, `node:test` + `tsx --test` for unit tests.

**Spec:** `docs/superpowers/specs/2026-03-27-mushaf-full-download-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/lib/pwa/mushafStatus.ts` | Create | Status checking (`isMushafDownloaded`), localStorage helpers, cache counting |
| `src/lib/pwa/mushafStatus.test.ts` | Create | Tests for pure helpers (localStorage key logic, status type construction) |
| `src/lib/pwa/downloadEngine.ts` | Rewrite | `downloadMushaf()`, `fetchAndCacheWithRetry()`, remove `downloadSurah()` + packDb imports |
| `src/lib/pwa/downloadEngine.test.ts` | Rewrite | Tests for `buildPageAssetUrls` (preserved), new `TOTAL_PAGES` constant |
| `src/components/MushafDownloadPrompt.tsx` | Create | Prompt card + progress bar + auto-resume + completion states |
| `src/lib/pwa/debugTools.ts` | Rewrite | Replace surah commands with mushaf commands |
| `src/app/layout.tsx` | Modify | Mount `<MushafDownloadPrompt />` |
| `src/lib/pwa/packDb.ts` | Delete | Replaced by localStorage + Cache API |
| `package.json` | Modify | Update `test:pwa` script to remove packDb test, add mushafStatus test |

---

## Chunk 1: Status Module + Download Engine

### Task 1: Create `mushafStatus.ts`

**Files:**
- Create: `src/lib/pwa/mushafStatus.ts`

- [ ] **Step 1: Create the mushafStatus module**

```typescript
// src/lib/pwa/mushafStatus.ts

const LS_KEY_DOWNLOADED = "miftah:mushaf-downloaded";
const LS_KEY_DISMISSED = "miftah:mushaf-dismissed";
const LS_KEY_STARTED = "miftah:mushaf-download-started";

const CACHE_IMAGES = "mushaf-images-v1";
const CACHE_DATA = "mushaf-data-v1";

export const TOTAL_PAGES = 604;
const TOTAL_DATA_ENTRIES = TOTAL_PAGES * 3; // manifest + layout + translation per page

export type MushafStatus =
  | { readonly state: "complete" }
  | { readonly state: "partial"; readonly downloadedPages: number }
  | { readonly state: "none" };

/**
 * Checks whether the full mushaf has been downloaded.
 *
 * Fast path: localStorage flag matches current version → complete.
 * Slow path: count WebP entries in image cache + data entries in data cache.
 */
export async function isMushafDownloaded(
  currentVersion: string,
): Promise<MushafStatus> {
  // Fast path
  const stored = localStorage.getItem(LS_KEY_DOWNLOADED);
  if (stored === currentVersion) {
    return { state: "complete" };
  }

  // Slow path — count cache entries
  try {
    const imageCache = await caches.open(CACHE_IMAGES);
    const imageKeys = await imageCache.keys();
    const webpCount = imageKeys.filter((r) =>
      r.url.includes("_mobile.webp"),
    ).length;

    if (webpCount === 0) {
      return { state: "none" };
    }

    if (webpCount >= TOTAL_PAGES) {
      const dataCache = await caches.open(CACHE_DATA);
      const dataKeys = await dataCache.keys();
      if (dataKeys.length >= TOTAL_DATA_ENTRIES) {
        // Cache is complete — set localStorage so we never run slow path again
        markMushafDownloaded(currentVersion);
        return { state: "complete" };
      }
    }

    return { state: "partial", downloadedPages: webpCount };
  } catch {
    // Cache API unavailable (SSR, unsupported browser)
    return { state: "none" };
  }
}

/** Mark the mushaf as fully downloaded for the given asset version. */
export function markMushafDownloaded(version: string): void {
  localStorage.setItem(LS_KEY_DOWNLOADED, version);
}

/** Clear the downloaded flag (for version migration or debug). */
export function clearMushafDownloaded(): void {
  localStorage.removeItem(LS_KEY_DOWNLOADED);
  localStorage.removeItem(LS_KEY_STARTED);
}

/** Check if user previously tapped "Muat turun". */
export function hasUserStartedDownload(): boolean {
  return localStorage.getItem(LS_KEY_STARTED) === "true";
}

/** Record that the user tapped "Muat turun". */
export function setDownloadStarted(): void {
  localStorage.setItem(LS_KEY_STARTED, "true");
}

/** Check if user dismissed the prompt within the last 24 hours. */
export function isPromptDismissed(): boolean {
  const raw = localStorage.getItem(LS_KEY_DISMISSED);
  if (raw === null) return false;
  const timestamp = Number(raw);
  if (Number.isNaN(timestamp)) return false;
  const twentyFourHours = 24 * 60 * 60 * 1000;
  return Date.now() - timestamp < twentyFourHours;
}

/** Dismiss the download prompt for 24 hours. */
export function dismissPrompt(): void {
  localStorage.setItem(LS_KEY_DISMISSED, String(Date.now()));
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/pwa/mushafStatus.ts
git commit -m "feat: add mushafStatus module for download state tracking"
```

---

### Task 2: Create `mushafStatus.test.ts`

**Files:**
- Create: `src/lib/pwa/mushafStatus.test.ts`

The browser-dependent functions (`isMushafDownloaded`, Cache API) cannot be tested with `node:test` (no `caches` global). Test the pure localStorage helpers using an in-memory mock.

- [ ] **Step 1: Write tests for pure helpers**

```typescript
// src/lib/pwa/mushafStatus.test.ts
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

// Mock localStorage before importing module
const store: Record<string, string> = {};
const mockLocalStorage = {
  getItem: (key: string): string | null => store[key] ?? null,
  setItem: (key: string, value: string): void => {
    store[key] = value;
  },
  removeItem: (key: string): void => {
    delete store[key];
  },
  clear: (): void => {
    for (const key of Object.keys(store)) delete store[key];
  },
  get length() {
    return Object.keys(store).length;
  },
  key: (_index: number): string | null => null,
};
(globalThis as unknown as Record<string, unknown>).localStorage = mockLocalStorage;

import {
  TOTAL_PAGES,
  markMushafDownloaded,
  clearMushafDownloaded,
  hasUserStartedDownload,
  setDownloadStarted,
  isPromptDismissed,
  dismissPrompt,
} from "./mushafStatus.ts";

describe("TOTAL_PAGES", () => {
  it("equals 604", () => {
    assert.equal(TOTAL_PAGES, 604);
  });
});

describe("markMushafDownloaded / clearMushafDownloaded", () => {
  beforeEach(() => {
    mockLocalStorage.clear();
  });

  it("sets and reads the downloaded version", () => {
    markMushafDownloaded("5");
    assert.equal(store["miftah:mushaf-downloaded"], "5");
  });

  it("clearMushafDownloaded removes downloaded flag and started flag", () => {
    markMushafDownloaded("5");
    setDownloadStarted();
    clearMushafDownloaded();
    assert.equal(store["miftah:mushaf-downloaded"], undefined);
    assert.equal(store["miftah:mushaf-download-started"], undefined);
  });
});

describe("hasUserStartedDownload / setDownloadStarted", () => {
  beforeEach(() => {
    mockLocalStorage.clear();
  });

  it("returns false when nothing is set", () => {
    assert.equal(hasUserStartedDownload(), false);
  });

  it("returns true after setDownloadStarted", () => {
    setDownloadStarted();
    assert.equal(hasUserStartedDownload(), true);
  });
});

describe("isPromptDismissed / dismissPrompt", () => {
  beforeEach(() => {
    mockLocalStorage.clear();
  });

  it("returns false when nothing is set", () => {
    assert.equal(isPromptDismissed(), false);
  });

  it("returns true immediately after dismissPrompt", () => {
    dismissPrompt();
    assert.equal(isPromptDismissed(), true);
  });

  it("returns false for a timestamp older than 24 hours", () => {
    const twentyFiveHoursAgo = Date.now() - 25 * 60 * 60 * 1000;
    store["miftah:mushaf-dismissed"] = String(twentyFiveHoursAgo);
    assert.equal(isPromptDismissed(), false);
  });

  it("returns false for invalid timestamp", () => {
    store["miftah:mushaf-dismissed"] = "not-a-number";
    assert.equal(isPromptDismissed(), false);
  });
});

// Note: isMushafDownloaded depends on the Cache API which is not available
// in Node. It is tested through manual/e2e testing in the browser.
```

- [ ] **Step 2: Run the test to verify it passes**

Run: `npx tsx --test src/lib/pwa/mushafStatus.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/lib/pwa/mushafStatus.test.ts
git commit -m "test: add mushafStatus constant tests"
```

---

### Task 3: Rewrite `downloadEngine.ts`

**Files:**
- Modify: `src/lib/pwa/downloadEngine.ts`

Remove all packDb imports and `downloadSurah()`. Add `downloadMushaf()` with batched concurrency, retry wrapper, storage quota check, version migration, and concurrency guard.

> **Note on concurrency:** The spec prose (line 37) says "3 pages in parallel (12 concurrent fetches)" but the spec's own pseudocode (lines 84-89) shows 2-page batches (8 concurrent fetches). We follow the pseudocode — it's the more conservative and explicit specification. The `fetchAndCache` function is preserved unchanged as a single-attempt fetcher; a new private `fetchAndCacheWithRetry` wraps it with exponential backoff per the spec's retry requirement.

- [ ] **Step 1: Rewrite the download engine**

Replace the entire file with:

```typescript
// src/lib/pwa/downloadEngine.ts

import {
  TOTAL_PAGES,
  markMushafDownloaded,
  clearMushafDownloaded,
} from "./mushafStatus";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface PwaConfig {
  readonly cdnAssetVersion: string;
  readonly supabaseStorageBase: string;
  readonly pagesBucket: string;
  readonly manifestsBucket: string;
}

let cachedConfig: PwaConfig | null = null;

export async function loadPwaConfig(): Promise<PwaConfig> {
  if (cachedConfig !== null) return cachedConfig;

  const response = await fetch("/pwa-config.json");
  if (!response.ok) {
    throw new Error(`Failed to load pwa-config.json: ${response.status}`);
  }

  const data: unknown = await response.json();
  if (!isPwaConfig(data)) {
    throw new Error("Invalid pwa-config.json: missing required fields");
  }
  if (!data.supabaseStorageBase) {
    throw new Error(
      "pwa-config.json has an empty supabaseStorageBase. Set NEXT_PUBLIC_SUPABASE_URL and rebuild.",
    );
  }

  cachedConfig = data;
  return data;
}

function isPwaConfig(value: unknown): value is PwaConfig {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.cdnAssetVersion === "string" &&
    typeof v.supabaseStorageBase === "string" &&
    typeof v.pagesBucket === "string" &&
    typeof v.manifestsBucket === "string"
  );
}

// ---------------------------------------------------------------------------
// URL construction
// ---------------------------------------------------------------------------

export interface PageAssetUrls {
  readonly webp: string;
  readonly manifest: string;
  readonly layout: string;
  readonly translation: string;
}

function zeroPad(n: number, digits = 3): string {
  return String(n).padStart(digits, "0");
}

export function buildPageAssetUrls(
  pageNumber: number,
  config: PwaConfig,
): PageAssetUrls {
  const padded = zeroPad(pageNumber);
  const base = config.supabaseStorageBase;
  const v = config.cdnAssetVersion;

  return {
    webp: `${base}/${config.pagesBucket}/page_${padded}_mobile.webp?v=${v}`,
    manifest: `${base}/${config.manifestsBucket}/page_${padded}.manifest.json?v=${v}`,
    layout: `/layouts/page-${padded}.json`,
    translation: `/translations/page-${padded}.json`,
  };
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

export type MushafDownloadProgress = {
  readonly downloadedPages: number;
  readonly totalPages: number;
};

type ProgressCallback = (progress: MushafDownloadProgress) => void;

// ---------------------------------------------------------------------------
// Cache names
// ---------------------------------------------------------------------------

const CACHE_IMAGES = "mushaf-images-v1";
const CACHE_DATA = "mushaf-data-v1";

// ---------------------------------------------------------------------------
// Cancellation
// ---------------------------------------------------------------------------

let activeController: AbortController | null = null;

export function cancelDownload(): void {
  if (activeController !== null) {
    activeController.abort();
    activeController = null;
  }
}

// ---------------------------------------------------------------------------
// Concurrency guard
// ---------------------------------------------------------------------------

let isDownloading = false;

// ---------------------------------------------------------------------------
// Fetch with retry
// ---------------------------------------------------------------------------

async function fetchAndCache(
  url: string,
  cacheName: string,
  controller: AbortController,
): Promise<void> {
  const cache = await caches.open(cacheName);
  const existing = await cache.match(url);
  if (existing !== undefined) return; // already cached — skip

  const response = await fetch(url, { signal: controller.signal });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  await cache.put(url, response);
}

async function fetchAndCacheWithRetry(
  url: string,
  cacheName: string,
  controller: AbortController,
  maxRetries = 2,
): Promise<void> {
  const delays = [1000, 3000]; // exponential backoff
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      await fetchAndCache(url, cacheName, controller);
      return;
    } catch (error) {
      if (controller.signal.aborted) throw error;
      if (attempt === maxRetries) throw error;
      await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
    }
  }
}

// ---------------------------------------------------------------------------
// Version migration
// ---------------------------------------------------------------------------

async function migrateIfVersionChanged(
  currentVersion: string,
): Promise<void> {
  const stored = localStorage.getItem("miftah:mushaf-downloaded");
  if (stored !== null && stored !== currentVersion) {
    // Version mismatch — clear old caches
    await caches.delete(CACHE_IMAGES);
    await caches.delete(CACHE_DATA);
    clearMushafDownloaded();
  }
}

// ---------------------------------------------------------------------------
// Storage quota check
// ---------------------------------------------------------------------------

const REQUIRED_BYTES = 150_000_000; // ~150 MB

async function checkStorageQuota(): Promise<boolean> {
  if (!navigator.storage?.estimate) return true; // can't check, proceed optimistically
  const estimate = await navigator.storage.estimate();
  const available = (estimate.quota ?? 0) - (estimate.usage ?? 0);
  return available >= REQUIRED_BYTES;
}

async function requestPersistentStorage(): Promise<void> {
  if (navigator.storage?.persist) {
    await navigator.storage.persist();
  }
}

// ---------------------------------------------------------------------------
// Download engine
// ---------------------------------------------------------------------------

async function downloadPage(
  page: number,
  config: PwaConfig,
  controller: AbortController,
): Promise<void> {
  const urls = buildPageAssetUrls(page, config);
  await Promise.all([
    fetchAndCacheWithRetry(urls.webp, CACHE_IMAGES, controller),
    fetchAndCacheWithRetry(urls.manifest, CACHE_DATA, controller),
    fetchAndCacheWithRetry(urls.layout, CACHE_DATA, controller),
    fetchAndCacheWithRetry(urls.translation, CACHE_DATA, controller),
  ]);
}

export async function downloadMushaf(
  config: PwaConfig,
  onProgress?: ProgressCallback,
): Promise<void> {
  if (isDownloading) return; // concurrency guard
  isDownloading = true;

  const controller = new AbortController();
  activeController = controller;

  try {
    // Version migration
    await migrateIfVersionChanged(config.cdnAssetVersion);

    // Storage checks
    const hasQuota = await checkStorageQuota();
    if (!hasQuota) {
      throw new Error(
        "Ruang storan tidak mencukupi (~150 MB diperlukan)",
      );
    }
    await requestPersistentStorage();

    // Download pages in batches of 2
    let completedPages = 0;

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
      completedPages += pagesInBatch;

      onProgress?.({
        downloadedPages: completedPages,
        totalPages: TOTAL_PAGES,
      });
    }

    if (!controller.signal.aborted) {
      markMushafDownloaded(config.cdnAssetVersion);
    }
  } catch (error) {
    if (
      error instanceof DOMException &&
      error.name === "QuotaExceededError"
    ) {
      throw new Error(
        "Ruang storan tidak mencukupi (~150 MB diperlukan)",
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

- [ ] **Step 2: Commit**

```bash
git add src/lib/pwa/downloadEngine.ts
git commit -m "feat: rewrite downloadEngine with full-mushaf download replacing per-surah"
```

---

### Task 4: Rewrite `downloadEngine.test.ts`

**Files:**
- Modify: `src/lib/pwa/downloadEngine.test.ts`

Keep existing `buildPageAssetUrls` tests (they still pass — the function is unchanged). Remove any surah-specific tests.

- [ ] **Step 1: Rewrite the test file**

```typescript
// src/lib/pwa/downloadEngine.test.ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildPageAssetUrls, type PwaConfig } from "./downloadEngine.ts";

const TEST_CONFIG: PwaConfig = {
  cdnAssetVersion: "4",
  supabaseStorageBase: "https://cdn.example.com/storage/v1/object/public",
  pagesBucket: "mushaf-pages",
  manifestsBucket: "mushaf-manifests",
};

describe("buildPageAssetUrls", () => {
  it("page 1 — correct URLs with zero-padded page number", () => {
    const urls = buildPageAssetUrls(1, TEST_CONFIG);

    assert.equal(
      urls.webp,
      "https://cdn.example.com/storage/v1/object/public/mushaf-pages/page_001_mobile.webp?v=4",
    );
    assert.equal(
      urls.manifest,
      "https://cdn.example.com/storage/v1/object/public/mushaf-manifests/page_001.manifest.json?v=4",
    );
    assert.equal(urls.layout, "/layouts/page-001.json");
    assert.equal(urls.translation, "/translations/page-001.json");
  });

  it("page 42 — proper zero-padding in all URLs", () => {
    const urls = buildPageAssetUrls(42, TEST_CONFIG);

    assert.ok(
      urls.webp.includes("page_042_mobile.webp?v=4"),
      `webp should include page_042_mobile.webp?v=4, got: ${urls.webp}`,
    );
    assert.ok(
      urls.manifest.includes("page_042.manifest.json?v=4"),
      `manifest should include page_042.manifest.json?v=4, got: ${urls.manifest}`,
    );
    assert.equal(urls.layout, "/layouts/page-042.json");
    assert.equal(urls.translation, "/translations/page-042.json");
  });

  it("page 100 — three-digit page number (no padding needed)", () => {
    const urls = buildPageAssetUrls(100, TEST_CONFIG);

    assert.ok(urls.webp.includes("page_100_mobile.webp"));
    assert.ok(urls.manifest.includes("page_100.manifest.json"));
    assert.equal(urls.layout, "/layouts/page-100.json");
    assert.equal(urls.translation, "/translations/page-100.json");
  });

  it("page 604 — last page of mushaf", () => {
    const urls = buildPageAssetUrls(604, TEST_CONFIG);

    assert.ok(urls.webp.includes("page_604_mobile.webp"));
    assert.ok(urls.manifest.includes("page_604.manifest.json"));
    assert.equal(urls.layout, "/layouts/page-604.json");
    assert.equal(urls.translation, "/translations/page-604.json");
  });

  it("webp and manifest use underscore separator, layout and translation use dash", () => {
    const urls = buildPageAssetUrls(5, TEST_CONFIG);

    assert.ok(urls.webp.includes("page_005"), "webp must use underscore");
    assert.ok(urls.manifest.includes("page_005"), "manifest must use underscore");
    assert.ok(urls.layout.includes("page-005"), "layout must use dash");
    assert.ok(urls.translation.includes("page-005"), "translation must use dash");
  });

  it("asset version is appended to remote URLs only", () => {
    const urls = buildPageAssetUrls(1, TEST_CONFIG);

    assert.ok(urls.webp.includes("?v=4"), "webp must have version param");
    assert.ok(urls.manifest.includes("?v=4"), "manifest must have version param");
    assert.equal(
      urls.layout.includes("?v="),
      false,
      "layout (local) must NOT have version param",
    );
    assert.equal(
      urls.translation.includes("?v="),
      false,
      "translation (local) must NOT have version param",
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it passes**

Run: `npx tsx --test src/lib/pwa/downloadEngine.test.ts`
Expected: PASS — all 6 tests green

- [ ] **Step 3: Commit**

```bash
git add src/lib/pwa/downloadEngine.test.ts
git commit -m "test: update downloadEngine tests for full-mushaf API"
```

---

## Chunk 2: UI Component + Integration

### Task 5: Create `MushafDownloadPrompt.tsx`

**Files:**
- Create: `src/components/MushafDownloadPrompt.tsx`

Client component with three visual states: prompt card (home page only), progress bar (all pages), hidden (complete).

- [ ] **Step 1: Create the component**

```tsx
// src/components/MushafDownloadPrompt.tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  type MushafStatus,
  isMushafDownloaded,
  hasUserStartedDownload,
  setDownloadStarted,
  isPromptDismissed,
  dismissPrompt,
  TOTAL_PAGES,
} from "@/lib/pwa/mushafStatus";
import {
  downloadMushaf,
  loadPwaConfig,
  cancelDownload,
  type MushafDownloadProgress,
} from "@/lib/pwa/downloadEngine";

type UIState =
  | { readonly kind: "loading" }
  | { readonly kind: "prompt" }
  | { readonly kind: "downloading"; readonly downloadedPages: number }
  | { readonly kind: "complete" }
  | { readonly kind: "error"; readonly message: string }
  | { readonly kind: "hidden" };

export function MushafDownloadPrompt() {
  const pathname = usePathname();
  const [ui, setUi] = useState<UIState>({ kind: "loading" });
  const [minimized, setMinimized] = useState(false);
  const completeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (completeTimerRef.current !== null) {
        clearTimeout(completeTimerRef.current);
      }
    };
  }, []);

  const startDownload = useCallback(
    async (
      config: Awaited<ReturnType<typeof loadPwaConfig>>,
    ) => {
      try {
        await downloadMushaf(config, (progress: MushafDownloadProgress) => {
          setUi({
            kind: "downloading",
            downloadedPages: progress.downloadedPages,
          });
        });

        setUi({ kind: "complete" });
        completeTimerRef.current = setTimeout(() => {
          setUi({ kind: "hidden" });
        }, 3000);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Muat turun gagal";
        setUi({ kind: "error", message });
      }
    },
    [],
  );

  // Check status on mount
  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const config = await loadPwaConfig();
        const status: MushafStatus = await isMushafDownloaded(
          config.cdnAssetVersion,
        );
        if (cancelled) return;

        const started = hasUserStartedDownload();

        if (status.state === "complete") {
          setUi({ kind: "hidden" });
          return;
        }

        if (status.state === "partial" && started) {
          // Auto-resume
          setUi({
            kind: "downloading",
            downloadedPages: status.downloadedPages,
          });
          startDownload(config);
          return;
        }

        // state is "none" or "partial" without user opt-in
        if (isPromptDismissed()) {
          setUi({ kind: "hidden" });
          return;
        }

        setUi({ kind: "prompt" });
      } catch {
        setUi({ kind: "hidden" });
      }
    }

    check();
    return () => {
      cancelled = true;
    };
  }, [startDownload]);

  const handleStart = useCallback(async () => {
    setDownloadStarted();
    setUi({ kind: "downloading", downloadedPages: 0 });
    try {
      const config = await loadPwaConfig();
      await startDownload(config);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Muat turun gagal";
      setUi({ kind: "error", message });
    }
  }, [startDownload]);

  const handleDismiss = useCallback(() => {
    dismissPrompt();
    setUi({ kind: "hidden" });
  }, []);

  const handleRetry = useCallback(async () => {
    setUi({ kind: "downloading", downloadedPages: 0 });
    try {
      const config = await loadPwaConfig();
      await startDownload(config);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Muat turun gagal";
      setUi({ kind: "error", message });
    }
  }, [startDownload]);

  const handleMinimize = useCallback(() => {
    setMinimized(true);
  }, []);

  // --- Render ---

  if (ui.kind === "loading" || ui.kind === "hidden") {
    return null;
  }

  // Prompt card: only on home page
  if (ui.kind === "prompt") {
    if (pathname !== "/") return null;

    return (
      <div className="mx-auto mt-4 max-w-md rounded-xl border border-amber-200/50 bg-amber-50/80 p-4 text-center shadow-sm dark:border-amber-800/30 dark:bg-amber-950/30">
        <p className="mb-3 text-sm text-amber-900 dark:text-amber-100">
          Muat turun Mushaf untuk bacaan luar talian (~120 MB)
        </p>
        <div className="flex justify-center gap-3">
          <button
            onClick={handleStart}
            className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-700 dark:bg-teal-500 dark:hover:bg-teal-600"
          >
            Muat turun
          </button>
          <button
            onClick={handleDismiss}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Nanti
          </button>
        </div>
      </div>
    );
  }

  // Progress bar (downloading, complete, error): all pages
  if (ui.kind === "downloading") {
    if (minimized) {
      return (
        <button
          onClick={() => setMinimized(false)}
          className="fixed bottom-[env(safe-area-inset-bottom,0px)] right-4 z-50 mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-teal-600 text-white shadow-lg"
          aria-label="Tunjukkan kemajuan muat turun"
        >
          <span className="text-xs font-bold">
            {Math.round((ui.downloadedPages / TOTAL_PAGES) * 100)}%
          </span>
        </button>
      );
    }

    const percentage = (ui.downloadedPages / TOTAL_PAGES) * 100;

    return (
      <div
        className="fixed inset-x-0 bottom-[env(safe-area-inset-bottom,0px)] z-50 border-t border-gray-200 bg-white/95 px-4 py-2 backdrop-blur-sm dark:border-gray-700 dark:bg-gray-900/95"
        role="progressbar"
        aria-valuemin={0}
        aria-valuenow={ui.downloadedPages}
        aria-valuemax={TOTAL_PAGES}
        aria-label="Memuat turun Mushaf"
      >
        <div className="mx-auto flex max-w-md items-center gap-3">
          <div className="flex-1">
            <div className="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
              <div
                className="h-full rounded-full bg-teal-500 transition-all duration-300"
                style={{ width: `${percentage}%` }}
              />
            </div>
          </div>
          <span className="whitespace-nowrap text-xs text-gray-600 dark:text-gray-300">
            {ui.downloadedPages}/{TOTAL_PAGES} halaman
          </span>
          <button
            onClick={handleMinimize}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            aria-label="Kecilkan bar kemajuan"
          >
            ×
          </button>
        </div>
      </div>
    );
  }

  if (ui.kind === "complete") {
    return (
      <div className="fixed inset-x-0 bottom-[env(safe-area-inset-bottom,0px)] z-50 border-t border-teal-200 bg-teal-50/95 px-4 py-2 text-center backdrop-blur-sm dark:border-teal-800 dark:bg-teal-950/95">
        <span className="text-sm text-teal-700 dark:text-teal-300">
          Mushaf sedia luar talian ✓
        </span>
      </div>
    );
  }

  if (ui.kind === "error") {
    return (
      <div className="fixed inset-x-0 bottom-[env(safe-area-inset-bottom,0px)] z-50 border-t border-red-200 bg-red-50/95 px-4 py-2 backdrop-blur-sm dark:border-red-800 dark:bg-red-950/95">
        <div className="mx-auto flex max-w-md items-center justify-between">
          <span className="text-sm text-red-700 dark:text-red-300">
            Muat turun terganggu
          </span>
          <button
            onClick={handleRetry}
            className="rounded-lg bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700"
          >
            Cuba semula
          </button>
        </div>
      </div>
    );
  }

  return null;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/MushafDownloadPrompt.tsx
git commit -m "feat: add MushafDownloadPrompt component with prompt card, progress bar, and auto-resume"
```

---

### Task 6: Rewrite `debugTools.ts`

**Files:**
- Modify: `src/lib/pwa/debugTools.ts`

Replace surah-specific commands with mushaf-level commands.

- [ ] **Step 1: Rewrite debugTools**

```typescript
// src/lib/pwa/debugTools.ts
"use client";

import { downloadMushaf, loadPwaConfig, cancelDownload } from "./downloadEngine";
import {
  isMushafDownloaded,
  clearMushafDownloaded,
} from "./mushafStatus";

export function installDebugTools(): void {
  if (typeof window === "undefined") return;

  const debug = {
    async downloadMushaf() {
      const config = await loadPwaConfig();
      console.log("[PWA Debug] Downloading full mushaf...");
      await downloadMushaf(config, (progress) => {
        console.log(
          `[PWA Debug] ${progress.downloadedPages}/${progress.totalPages} pages`,
        );
      });
      console.log("[PWA Debug] Done.");
    },
    cancelDownload,
    async mushafStatus() {
      const config = await loadPwaConfig();
      const status = await isMushafDownloaded(config.cdnAssetVersion);
      console.log("[PWA Debug] Mushaf status:", status);
      return status;
    },
    async clearDownload() {
      clearMushafDownloaded();
      await caches.delete("mushaf-images-v1");
      await caches.delete("mushaf-data-v1");
      console.log("[PWA Debug] Download cleared (localStorage + caches).");
    },
  };

  (window as unknown as Record<string, unknown>).__miftahDebug = debug;
  if (process.env.NODE_ENV === "development") {
    // Intentional: debug announcement only in dev builds
    console.log(
      "[PWA Debug] Tools: window.__miftahDebug.downloadMushaf(), .mushafStatus(), .cancelDownload(), .clearDownload()",
    );
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/pwa/debugTools.ts
git commit -m "feat: update debugTools with mushaf-level commands"
```

---

### Task 7: Mount component in layout + delete packDb

**Files:**
- Modify: `src/app/layout.tsx`
- Delete: `src/lib/pwa/packDb.ts`
- Delete: `src/lib/pwa/packDb.test.ts` (if exists)

- [ ] **Step 1: Add MushafDownloadPrompt to layout.tsx**

In `src/app/layout.tsx`, add the import:

```typescript
import { MushafDownloadPrompt } from "@/components/MushafDownloadPrompt";
```

And add `<MushafDownloadPrompt />` after `<PwaDebugLoader />` and before `<ReadAudioProvider>`:

```tsx
<PwaDebugLoader />
<MushafDownloadPrompt />
<ReadAudioProvider>{children}</ReadAudioProvider>
```

- [ ] **Step 2: Delete packDb.ts and its test**

```bash
rm src/lib/pwa/packDb.ts
rm -f src/lib/pwa/packDb.test.ts
```

- [ ] **Step 3: Update `test:pwa` script in package.json**

Change the `test:pwa` script to remove `packDb.test.ts` and `downloadEngine.test.ts` references, and add `mushafStatus.test.ts`:

From:
```
"test:pwa": "tsx --test src/lib/pwa/surahPageMap.test.ts src/lib/pwa/offlineTranslations.test.ts src/lib/pwa/packDb.test.ts src/lib/pwa/downloadEngine.test.ts src/lib/pwa/offlinePageData.test.ts"
```

To:
```
"test:pwa": "tsx --test src/lib/pwa/surahPageMap.test.ts src/lib/pwa/offlineTranslations.test.ts src/lib/pwa/mushafStatus.test.ts src/lib/pwa/downloadEngine.test.ts src/lib/pwa/offlinePageData.test.ts"
```

- [ ] **Step 4: Commit**

```bash
git add src/app/layout.tsx package.json
git rm src/lib/pwa/packDb.ts src/lib/pwa/packDb.test.ts
git commit -m "feat: mount MushafDownloadPrompt in layout, delete packDb"
```

---

### Task 8: Build verification

- [ ] **Step 1: Run tests**

```bash
npm run test:pwa
```

Expected: All tests pass (surahPageMap, offlineTranslations, mushafStatus, downloadEngine, offlinePageData).

- [ ] **Step 2: Run build**

```bash
npm run build
```

Expected: Build succeeds with no TypeScript errors. Verify no imports of deleted `packDb` remain.

- [ ] **Step 3: Fix any build errors**

If there are import errors referencing `packDb` or `downloadSurah`, find and remove them:

```bash
grep -r "packDb\|downloadSurah" src/ --include="*.ts" --include="*.tsx" -l
```

Fix any remaining references, then re-run build.

- [ ] **Step 4: Final commit if fixes were needed**

```bash
git add -A
git commit -m "fix: resolve remaining references to deleted packDb module"
```

---

## Post-Implementation Notes

### Manual Testing Checklist

These scenarios require a browser to verify (cannot be unit tested with `node:test`):

1. Visit `/` → download prompt card appears
2. Tap "Muat turun" → progress bar appears, download begins
3. Navigate to `/read` → progress bar persists
4. Close tab, reopen → auto-resume with progress bar
5. Download completes → "Mushaf sedia luar talian ✓" for 3 seconds → hidden
6. Subsequent visits → no download UI
7. Tap "Nanti" → prompt hidden for 24 hours
8. `window.__miftahDebug.mushafStatus()` → reports correct state
9. `window.__miftahDebug.clearDownload()` → resets, prompt reappears
10. Interrupt mid-download (airplane mode) → error state with "Cuba semula"
11. iOS Safari add-to-home-screen → offline content loads

### What Was Not Changed

- `public/sw.js` — cache routing already handles all asset types
- `src/lib/pwa/offlinePageData.ts` — reads from cache; doesn't care how data got there
- `src/lib/pwa/surahPageMap.ts` — used by hifz features, not touched
- `src/lib/pwa/swRegistration.ts` — SW lifecycle unchanged
- Prebuild pipeline / `pwa-config.json` — unchanged
