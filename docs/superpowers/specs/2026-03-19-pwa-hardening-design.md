# Miftah PWA Hardening — Design Spec

**Date:** 2026-03-19
**Status:** Draft
**Linear parent:** KHA-26

## 1. Goal

Turn Miftah from a Quran website into an installable PWA with offline reading. The user should be able to install it on their home screen, download surahs, and read the mushaf offline with tap-to-translate — identical to the online experience minus text selection.

### Success criteria

- Android Chrome install flow works end to end.
- iPhone add-to-home-screen works with guidance.
- Downloaded surah pages open offline with page image, hitbox overlays, and BM/EN word meanings.
- Last-read position survives reloads and poor connectivity.
- Online-only features (Hifz, Faham, auth) show calm BM messages when offline instead of crashing.
- No regressions to online reading performance.

## 2. Key decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Offline image format | Mobile WebP only | 184 KB/page avg. ~137 MB total mushaf. Fits 200 MB budget. |
| SW tooling | Hand-rolled `public/sw.js` | Full control, no dependency friction with Next.js 16. Existing SW already in place. |
| Offline font strategy | Image-only v1 | QCF V2 fonts are 340 MB. Image rendering preserves visual fidelity. Font caching deferred to v2. |
| Rendering path | Separate online (RSC) / offline (client) | `readPageData.ts` is server-only. Offline uses a new client-side module. |
| Cache invalidation | URL-based via `CDN_ASSET_VERSION` | Leverages existing `?v=N` pattern. No user prompts for rendering updates. |
| Reading state sync | localStorage + sync-on-reconnect | Sufficient for page position + bookmarks. No IndexedDB queue for reading state (IndexedDB still used for pack metadata). |
| SW interception | URL allowlist | Only intercept known cacheable patterns. Everything else network-only. Never cache RSC data. |
| Icons | Placeholder for now | Proper icons added before public release (KHA-186). |

## 3. Architecture

```
┌──────────────────────────────────────────────┐
│  Layer 4: Download UX + Offline Indicators   │  KHA-183, KHA-185
│  (download manager, progress, offline banner) │
├──────────────────────────────────────────────┤
│  Layer 3: Offline Read Route                 │  KHA-30
│  (client-side renderer from cached data)     │
├──────────────────────────────────────────────┤
│  Layer 2: Content Packs + Storage            │  KHA-29
│  (IndexedDB metadata + Cache API assets)     │
├──────────────────────────────────────────────┤
│  Layer 1: Service Worker + App Shell         │  KHA-28, KHA-182
│  (URL allowlist routing, offline shell)      │
├──────────────────────────────────────────────┤
│  Layer 0: Installability                     │  KHA-27
│  (manifest, placeholder icons, meta tags)    │
├──────────────────────────────────────────────┤
│  Prereq: Split translations per-page         │  build pipeline
│  (604 × ~3.8 KB JSON files)                 │
└──────────────────────────────────────────────┘
  Cross-cutting: KHA-184 (update flow), KHA-187 (iOS), KHA-32 (QA)
```

### Execution order

Prereq → Layer 0 → Layer 1 → Layer 2 → Layer 3 → Layer 4 → cross-cutting.

Each layer is independently testable. Layer 2 includes a dev-only download trigger so Layer 3 can be tested before the full download UX (Layer 4) exists.

### What does NOT change

- Online reading path (`readPageData.ts`) — untouched.
- Hifz, Faham, auth — remain online-only. Get calm offline messages, not new capabilities.
- Audio caching — existing `miftah-audio-v1` cache stays as-is.
- Database schema — no Supabase migrations needed.

## 4. Prereq: translation file split

### Problem

`data/bm_wbw_complete.json` is a 2.3 MB monolith containing translations for all 77,430 words. Loading it whole per page is wasteful online and makes offline pack construction complex.

### Solution

Build-time script splits the file into 604 per-page JSON files:

```
public/translations/page-001.json  (~3.8 KB)
public/translations/page-002.json  (~3.8 KB)
...
public/translations/page-604.json  (~3.8 KB)
```

Each file contains only the word translations needed for that page. The script runs as part of the build pipeline (`npm run build:translations`).

Each per-page file contains **both BM and EN** translations merged together (sourced from `bm_wbw_complete.json` and `english-wbw-translation.json`). The split script must fail the build if any page produces zero translations (sanity check).

**Server vs client boundary:** `wbwTranslations.ts` is a server-only module (uses `node:fs/promises`). It stays unchanged for the online RSC path. A new client-side module `src/lib/pwa/offlineTranslations.ts` fetches per-page JSON files via `fetch()` for offline use.

### File changes

- New: `scripts/split-translations.ts` — merges BM + EN, splits per-page, fails build on zero-translation pages
- New: `public/translations/` directory (604 files, gitignored, generated at build)
- New: `src/lib/pwa/offlineTranslations.ts` — client-side per-page translation loader
- Unchanged: `src/lib/wbwTranslations.ts` — stays server-only for RSC path
- Modified: `next.config.ts` — add build step
- Modified: `.gitignore` — exclude generated translation files

## 5. Layer 0: Installability (KHA-27)

### Manifest

New file: `src/app/manifest.ts` (Next.js dynamic manifest).

```typescript
export default function manifest() {
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
      { src: "/icons/icon-192-maskable.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
```

### Meta tags

Added to `src/app/layout.tsx` `<head>`:

```html
<meta name="theme-color" content="#1a1a2e" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
```

### Placeholder icons

Generate minimal placeholder icons (solid color + "م" character) at build time or manually. Replace with designed icons before public release (KHA-186).

### iOS install guidance

Detect standalone mode via `window.matchMedia('(display-mode: standalone)')`. If not standalone and iOS Safari, show a dismissible banner:

> "Tambah Miftah ke Skrin Utama untuk pengalaman terbaik."

With a small Safari share icon illustration. Dismissal saved to localStorage. Show at most once per 7 days.

## 6. Layer 1: Service Worker + App Shell (KHA-28, KHA-182)

### SW rewrite

`public/sw.js` is rewritten from the current 34-line audio-only SW to a multi-cache router.

### Build-time injection

A build script replaces a placeholder in `sw.js` with the current build ID:

```javascript
const BUILD_ID = "__BUILD_ID__"; // replaced at build time
```

This is used for app shell cache naming and stale cache cleanup.

### Cache buckets

| Cache name | Contents | Lifetime |
|-----------|----------|----------|
| `app-shell-${BUILD_ID}` | `/_next/static/*`, `/offline` shell HTML | Wiped when BUILD_ID changes |
| `mushaf-images-v1` | Mobile WebP page images | Durable, survives deploys |
| `mushaf-data-v1` | Manifest JSONs, layout JSONs, translation JSONs | Durable, survives deploys |
| `miftah-audio-v1` | EveryAyah.com audio files | Durable (existing) |

### Interception matrix

| URL pattern | Strategy | Cache |
|-------------|----------|-------|
| `/_next/static/*` | Cache-first | `app-shell-${BUILD_ID}` |
| Supabase Storage `*.webp` | Cache-first | `mushaf-images-v1` |
| Supabase Storage `*.manifest.json` | Cache-first | `mushaf-data-v1` |
| `/translations/page-*.json` | Cache-first | `mushaf-data-v1` |
| `/api/mushaf/*` (local image fallback) | Cache-first | `mushaf-images-v1` |
| `everyayah.com/*` | Cache-first | `miftah-audio-v1` |
| `/offline` | Cache-only | `app-shell-${BUILD_ID}` |
| All other requests | **Network-only** | — |

**Implementation rule:** The SW uses a URL allowlist. If a request does not match any cacheable pattern above, it passes through to the network untouched. This includes RSC flight data (requests with `RSC: 1`, `Next-Router-State-Tree`, or `Next-Router-Prefetch` headers), API routes, and all navigation requests. Note: Next.js App Router does NOT use `/_next/data/*` paths (that is a Pages Router pattern). RSC payloads are fetched to the same page URL with special headers — the allowlist approach handles this correctly because those requests simply do not match any cached pattern.

### Offline fallback

When a navigation request fails (network error + no cache hit), the SW serves `/offline` — a static HTML file (`public/offline.html`) that:

1. Loads a pre-bundled offline module (~200 KB estimated: minimal React + offline UI logic, bundled separately from the main Next.js build).
2. Checks IndexedDB for downloaded surah packs.
3. If downloaded content exists: renders the last-read page from cache.
4. If no downloaded content: shows a calm message — "Anda sedang luar talian. Muat turun surah untuk bacaan luar talian."

**Decision: `public/offline.html`, not a Next.js route.** A Next.js route would require the SW to cache RSC output, which contradicts the allowlist strategy. The static HTML file works independently of the Next.js server. A build step bundles the offline UI module (`scripts/build-offline.ts`) and inlines it into `offline.html`.

**Estimated app shell size:** ~2-3 MB total (offline.html + bundled JS + CSS + placeholder icons). This is included in the storage budget.

### SW lifecycle

```
install → cache app shell assets + /offline page → skipWaiting()
activate → delete old app-shell-${OLD_BUILD_ID} caches → clients.claim()
fetch → match against interception matrix
```

### SW registration

Refactor `src/lib/hifz/audioPreCache.ts`:
- Extract `registerServiceWorker()` to `src/lib/pwa/swRegistration.ts`
- Add `onControllerChange` handler for update flow (KHA-184)
- `audioPreCache.ts` imports from the shared module

### File changes

- Rewritten: `public/sw.js`
- New: `public/offline.html` — static offline app shell
- New: `src/lib/pwa/swRegistration.ts`
- New: `scripts/inject-build-id.ts` (build step)
- New: `scripts/build-offline.ts` (bundles offline UI module into offline.html)
- Modified: `src/lib/hifz/audioPreCache.ts` — delegates SW registration
- Modified: `src/components/ServiceWorkerRegistrar.tsx` — imports from new `swRegistration.ts`
- Modified: `src/app/layout.tsx` — uses new SW registration
- Modified: `package.json` — build step for SW injection

## 7. Layer 2: Content Packs + Storage (KHA-29)

### Pack unit

One pack = one surah. Contains references to all cached assets for that surah's pages.

### What gets cached per page (in Cache API)

| Asset | Avg size | Source URL pattern |
|-------|----------|--------------------|
| Mobile WebP image | 184 KB | `{SUPABASE}/mushaf-pages/page_NNN_mobile.webp?v={V}` |
| Page manifest JSON | 16 KB | `{SUPABASE}/mushaf-manifests/page_NNN.manifest.json?v={V}` |
| Layout JSON | 22 KB | `/layouts/page-NNN.json` (copied from `data/mushaf-layout/mushaf/` at build time) |
| Translation JSON | 3.8 KB | `/translations/page-NNN.json` |
| **Per-page total** | **~226 KB** | |

### Layout JSON access

Layout JSONs are currently server-only files at `data/mushaf-layout/mushaf/page-NNN.json` (604 files, ~32 MB total). For offline, they need to be URL-accessible to the client.

**Solution:** Copy to `public/layouts/page-NNN.json` at build time (`scripts/copy-layouts.ts`). Simpler than an API route, CDN-cacheable, and the SW can intercept and cache them like other mushaf data.

**Prerequisite:** The 604 layout JSON files must exist at `data/mushaf-layout/mushaf/`. These are already present in the repo and traced into the Vercel bundle via `outputFileTracingIncludes`.

### CDN asset version on the client

`CDN_ASSET_VERSION` is currently hardcoded in `mushafAssets.ts` (a server-only module). The download flow runs client-side and needs this version to construct URLs with `?v={V}`.

**Solution:** Inject `CDN_ASSET_VERSION` into `sw.js` alongside `BUILD_ID` during the build step. Also expose as `NEXT_PUBLIC_CDN_ASSET_VERSION` env var for client-side download logic. Alternatively, generate a `public/pwa-config.json` at build time:

```json
{
  "cdnAssetVersion": "4",
  "supabaseStorageBase": "https://xxx.supabase.co/storage/v1/object/public",
  "pagesBucket": "mushaf-pages",
  "manifestsBucket": "mushaf-manifests"
}
```

The download module fetches this config once on init. This avoids hardcoding Supabase URLs in client code.

### IndexedDB schema

Database: `miftah-pwa`, version 1.

**Store: `surahPacks`**
```typescript
interface SurahPack {
  surahId: number;        // 1-114, primary key
  status: "pending" | "downloading" | "complete" | "error";
  pageRange: [number, number]; // e.g., [2, 49] for Al-Baqarah
  totalPages: number;
  downloadedPages: number; // for progress tracking
  totalSizeBytes: number;
  assetVersion: string;   // CDN_ASSET_VERSION at download time
  downloadedAt: string | null; // ISO timestamp
  errorMessage: string | null;
}
```

**Store: `downloadHistory`**
```typescript
interface DownloadHistoryEntry {
  surahId: number;        // primary key
  lastDownloadedAt: string; // ISO timestamp
}
```

The `downloadHistory` store is also mirrored to localStorage key `miftah.download.history.v1` as a simple `number[]` of surah IDs. This survives iOS cache eviction (usually) and enables the "re-download my surahs" recovery flow.

### Surah-to-page mapping

Static lookup table built from `data/qul/quran-data.xml` at build time:

```typescript
// src/lib/pwa/surahPageMap.ts (generated)
export const SURAH_PAGE_MAP: Record<number, { startPage: number; endPage: number }> = {
  1: { startPage: 1, endPage: 1 },
  2: { startPage: 2, endPage: 49 },
  // ... 114 entries
};
```

### Download flow

```
User taps "Muat Turun" on surah
    ↓
Create/update surahPacks entry: status = "downloading", downloadedPages = 0
    ↓
For each page in surah (sequentially to avoid overwhelming network):
    1. Fetch mobile WebP → put in mushaf-images-v1 cache
    2. Fetch manifest JSON → put in mushaf-data-v1 cache
    3. Fetch layout JSON → put in mushaf-data-v1 cache
    4. Fetch translation JSON → put in mushaf-data-v1 cache
    5. Update surahPacks: downloadedPages++
    ↓
On success: status = "complete", record in downloadHistory
On error: status = "error", keep completed pages, record errorMessage
On resume: skip pages already in cache, continue from downloadedPages
```

### "Download All" flow

Same as per-surah but iterates surahs 1-114 sequentially. Shows overall progress (X/114 surahs, Y/604 pages).

### Download concurrency guard

Multiple tabs or rapid re-taps could trigger duplicate downloads of the same surah. Before starting a download, check `surahPacks` in IndexedDB:
- If `status === "downloading"`, skip (already in progress in another tab).
- Use `BroadcastChannel("miftah-downloads")` to coordinate progress updates across tabs.
- If the downloading tab closes mid-download, the status remains "downloading" — on next app launch, detect stale "downloading" entries (check if downloadedPages < totalPages and no BroadcastChannel listener responds) and reset to allow retry.

### Dev-only download trigger

For testing Layer 3 before the full download UX:
- Browser console: `window.__miftahDebug.downloadSurah(1)`
- Or a hidden route `/debug/pwa` (only in development)

### Storage budget

| Scenario | Size |
|----------|------|
| Single short surah (Al-Fatihah) | ~226 KB |
| Medium surah (Yasin, 6 pages) | ~1.4 MB |
| Large surah (Al-Baqarah, 49 pages) | ~11 MB |
| Full mushaf (604 pages) | ~137 MB |
| App shell + metadata overhead | ~3 MB |
| **Max total** | **~140 MB** |

## 8. Layer 3: Offline Read Route (KHA-30)

### Two rendering paths

The `/read/[page]` route component uses conditional rendering:

```
Is app online AND server-rendered data available?
    → YES: Use RSC server-rendered page (existing, unchanged)
    → NO:  Is page downloaded in cache?
        → YES: Client-render from cached data
        → NO:  Show "Halaman ini belum dimuat turun" with download CTA
```

### Client-side offline data module

New file: `src/lib/pwa/offlinePageData.ts`

```typescript
interface OfflinePageResult {
  available: true;
  imageUrl: string;       // blob URL or cache URL for WebP
  manifest: MushafPageManifest;
  layout: MushafLayoutPage;
  translations: MushafWordTranslationMap;
  surahMeta: { name_ar: string; name_en: string };
} | {
  available: false;
  reason: "not-downloaded" | "cache-miss" | "error";
}
```

This module:
1. Checks `surahPacks` in IndexedDB — is this page's surah downloaded?
2. Reads WebP image, manifest, layout, and translations from Cache API.
3. Assembles a data object compatible with `MushafPageView` props.
4. Returns `{ available: false }` if any required asset is missing.

### Offline MushafPageView

The existing `MushafPageView` component already supports image-based rendering with hitbox overlays. The offline path provides:
- `imageUrl` — the cached mobile WebP
- `manifest.words` — hitbox coordinates for tap targets
- `translations` — BM/EN word meanings for the tooltip

The offline path provides a subset of props. Props that are irrelevant offline are defaulted:
- `memorizedAyahKeys` → `[]` (no Hifz state offline)
- Audio callbacks → no-op (audio is online-only)
- Hifz-related callbacks → omitted or no-op

If `MushafPageView` requires props that cannot be defaulted, create a thin `OfflineMushafPageView` wrapper that adapts the cached data shape and omits online-only UI elements (audio controls, Hifz markers).

### Navigation

Offline page navigation (swipe left/right or page number input):
- Check if target page is in cache before navigating.
- If not cached, show "Halaman ini belum dimuat turun."
- Surah boundaries respected — can navigate within a downloaded surah.

### Reading state

`rememberLastReadPage(page)` continues writing to localStorage — works identically online and offline. Sync-on-reconnect (see section 10) pushes this to the server when back online.

## 9. Layer 4: Download UX + Offline Indicators (KHA-183, KHA-185)

### Download entry points

1. **Surah list / jump-to panel:** Each surah row shows a download icon. Downloaded surahs show a checkmark.
2. **Surah header on /read/[page]:** Small download action in the header area (not on the reading surface itself).
3. **Settings / storage management screen:** "Muat Turun" section with:
   - "Muat Turun Semua" button (~137 MB)
   - Per-surah list with download/delete actions
   - Total storage used display (e.g., "45 MB / 200 MB")

### Download progress UI

- Active download shows progress bar (X/Y pages) inline where the download was triggered.
- Multiple downloads queue sequentially.
- Cancel button stops current download, keeps completed pages.
- Network error shows retry option.

### Offline status indicators

**Global offline banner:**
- Detect via `navigator.onLine` + `online`/`offline` events.
- Show a subtle top banner: "Luar talian" in muted styling.
- Remove with brief "Kembali dalam talian" confirmation on reconnect.

**Per-feature degradation:**

| Feature | Offline behavior |
|---------|-----------------|
| `/read/[page]` (downloaded) | Full reading experience |
| `/read/[page]` (not downloaded) | "Halaman belum dimuat turun" + download CTA |
| `/hifz` | "Hifz memerlukan internet" |
| `/faham` | "Faham memerlukan internet" |
| `/auth/sign-in` | "Log masuk memerlukan internet" |
| Home dashboard | Show last cached snapshot, note "data mungkin tidak terkini" |

**Design constraint:** Keep indicators calm. No red banners. No alarming language. The sacred reading surface stays visually quiet.

## 10. Reading state sync (simplified KHA-31)

### No IndexedDB queue

The current `readingProgressStorage.ts` localStorage approach is sufficient:

```typescript
// src/lib/pwa/readingStateSync.ts (~50 lines)

export function setupReadingStateSync(): void {
  window.addEventListener("online", flushReadingState);
}

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
```

- Last-writer-wins conflict resolution — adequate for page position + bookmarks.
- On iOS (no Background Sync): flush happens on next foreground visit after reconnection.
- No retry count, no discard behavior. If POST fails, it retries next `online` event.

## 11. Cross-cutting: Update flow (KHA-184)

### SW update detection

```typescript
// In swRegistration.ts
navigator.serviceWorker.register("/sw.js").then((reg) => {
  reg.addEventListener("updatefound", () => {
    const newWorker = reg.installing;
    newWorker?.addEventListener("statechange", () => {
      if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
        // New version available
        showUpdateBanner();
      }
    });
  });
});
```

### Update UX

Non-intrusive banner at top: "Versi baharu tersedia" with "Kemas kini" (Refresh) button.

On tap:
1. Send `skipWaiting` message to new SW.
2. On `controllerchange` event, reload the page.

### Cache migration

The new SW's `activate` handler:
1. Enumerate all caches.
2. Delete any `app-shell-*` caches that don't match the current `BUILD_ID`.
3. Mushaf content caches (`mushaf-images-v1`, `mushaf-data-v1`) are durable — they survive SW updates.
4. If a future version changes the mushaf cache schema (e.g., `mushaf-images-v2`), the new SW deletes `v1` caches during activation.

### Downloaded pack survival

Mushaf content caches are keyed by content URLs, not build IDs. Downloaded packs survive app updates. They only refresh when `CDN_ASSET_VERSION` bumps (URL-based invalidation).

## 12. Cross-cutting: iOS constraints (KHA-187)

### Storage eviction handling

iOS Safari evicts all SW cache + IndexedDB after ~7 days of inactivity.

Mitigation:
1. On app launch, verify a canary entry in Cache API.
2. If canary is missing → storage was evicted.
3. Check `miftah.download.history.v1` in localStorage for previously downloaded surah IDs.
4. Show: "iOS telah memadam data luar talian. Muat turun semula?" with one-tap re-download.

### No Background Sync

Reading state flush uses `online` event (foreground only). No Background Sync API dependency.

### No beforeinstallprompt

iOS install guidance uses a custom dismissible banner instead of the Chrome install prompt event.

### Storage quota

`navigator.storage.persist()` returns `false` on iOS. Accept this — design for eviction recovery rather than eviction prevention.

## 13. New files summary

```
src/lib/pwa/
├── swRegistration.ts       # SW registration + update detection
├── offlinePageData.ts      # Client-side page data from cache
├── offlineTranslations.ts  # Client-side per-page translation loader
├── contentPacks.ts         # IndexedDB pack management + download logic
├── surahPageMap.ts         # Generated surah-to-page mapping
├── readingStateSync.ts     # Sync localStorage state on reconnect
├── storageAccounting.ts    # Storage usage calculation
└── offlineDetection.ts     # Online/offline state + UI helpers

src/components/
├── OfflineIndicator.tsx    # Global offline banner
├── InstallPrompt.tsx       # iOS install guidance + Android prompt
├── UpdateBanner.tsx        # "New version available" banner
├── DownloadManager.tsx     # Storage management screen
└── SurahDownloadButton.tsx # Per-surah download action

public/
├── sw.js                   # Rewritten service worker
├── offline.html            # Offline app shell (or Next.js route)
├── icons/                  # Placeholder PWA icons
├── layouts/                # Generated: 604 layout JSONs (build-time copy)
└── translations/           # Generated: 604 translation JSONs

src/app/api/reading/state/
└── route.ts               # POST: upsert reading progress for authenticated user

scripts/
├── split-translations.ts   # Build: merge BM+EN, split per-page, fail on zero translations
├── copy-layouts.ts         # Build: copy layout JSONs from data/mushaf-layout/mushaf/ to public/
├── generate-surah-map.ts   # Build: generate surahPageMap.ts from quran-data.xml
├── generate-pwa-config.ts  # Build: generate public/pwa-config.json with CDN URLs + version
├── inject-build-id.ts      # Build: inject BUILD_ID + CDN_ASSET_VERSION into sw.js
└── build-offline.ts        # Build: bundle offline UI module into offline.html
```

## 14. Modified files summary

| File | Change |
|------|--------|
| `public/sw.js` | Full rewrite — multi-cache router with URL allowlist |
| `src/app/layout.tsx` | Add manifest link, theme-color, apple meta tags, new SW registration |
| `src/components/ServiceWorkerRegistrar.tsx` | Import from new `swRegistration.ts` instead of `audioPreCache.ts` |
| `src/lib/hifz/audioPreCache.ts` | Extract SW registration to shared module |
| `next.config.ts` | Add build steps for translations, layouts, SW injection |
| `package.json` | Add build scripts |
| `.gitignore` | Exclude generated public/ files |

### New API routes

| Route | Purpose |
|-------|---------|
| `POST /api/reading/state` | Receives reading progress from sync-on-reconnect. Upserts `{ lastPage, lastReadAt, bookmarks }` to Supabase `reading_progress` table for the authenticated user. Returns `{ success: boolean }`. Unauthenticated requests return 401 (reading state stays local-only until user signs in). |

## 15. Testing strategy

### Per-layer verification

| Layer | Test method |
|-------|-------------|
| Layer 0 | Lighthouse PWA audit. Manual install on Android + iOS. |
| Layer 1 | SW unit tests (mock fetch). DevTools Application panel cache inspection. |
| Layer 2 | Integration test: download surah → verify Cache API + IndexedDB entries. |
| Layer 3 | E2E: download surah → go offline (DevTools) → navigate to page → verify rendering. |
| Layer 4 | Manual: download flows, progress UI, storage display, offline indicators. |

### Device QA matrix (KHA-32)

- Android Chrome (Pixel or Samsung)
- iOS Safari (iPhone)
- Desktop Chrome (smoke test)

### Offline simulation

- Chrome DevTools "Offline" checkbox
- Real airplane mode on device
- Throttled 2G connection for download progress testing

## 16. Risks and mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Next.js 16 SW incompatibility | SW breaks RSC streaming | URL allowlist — only intercept known patterns |
| iOS storage eviction | User loses downloaded content | Download history in localStorage + re-download flow |
| Large download fails mid-way | Partial pack, wasted bandwidth | Per-file progress tracking, resume on retry |
| CDN_ASSET_VERSION bump orphans cached images | Stale images served offline | URL-based invalidation — cache-miss auto-fetches new version online |
| Translation split changes online perf | Regression | Benchmark before/after; per-page fetch should be faster than 2.3 MB monolith |

## 17. Out of scope for v1

- Offline audio playback (audio remains on-demand streaming)
- QCF font caching (image-only offline rendering)
- Offline Hifz or Faham functionality
- Background Sync API
- Push notifications
- Designed app icons (placeholder only)
- Offline search / find-in-page
