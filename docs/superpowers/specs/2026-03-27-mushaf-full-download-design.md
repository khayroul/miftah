# Full Mushaf Download — Design Spec

**Date:** 2026-03-27
**Status:** Draft
**Related:** KHA-26 (PWA rollout), KHA-29 (offline reading packs)

## Context

Miftah's PWA hardening (PR #1) shipped a per-surah download engine, but no UI to trigger it. The full mushaf is ~120 MB (604 pages × 4 assets each), which is small enough to front-load in a single download. Per-surah download adds UX complexity (which surahs are downloaded? partial offline states) that isn't worth it for this payload size.

This spec replaces the per-surah download with a one-time full-mushaf download triggered on first visit, with auto-resume on interruption.

## Decision Record

| Question | Decision | Rationale |
|----------|----------|-----------|
| Per-surah vs full mushaf? | Full mushaf | ~120 MB is acceptable; eliminates partial-state complexity |
| When to trigger? | First visit prompt on home page | Most discoverable; no dependency on install event (iOS) |
| Download UX? | Background with persistent mini progress bar | User can keep reading while download runs |
| Interrupt recovery? | Auto-resume on next visit | `fetchAndCache` skips cached pages; resume is free |
| State tracking? | localStorage + cache inspection (no IndexedDB) | Cache is source of truth; localStorage for fast-path check |

## Architecture

### Download Engine (`src/lib/pwa/downloadEngine.ts`)

Rewrite the existing module. Remove `downloadSurah()` and its SURAH_PAGE_MAP dependency. Replace with:

#### `downloadMushaf(config, onProgress)`

```
downloadMushaf(config: PwaConfig, onProgress?: ProgressCallback): Promise<void>
```

- Loops pages 1→604
- Downloads 3 pages in parallel (12 concurrent fetches) for throughput
- Each page: 4 assets via `fetchAndCache()` (WebP, manifest, layout, translation)
- `fetchAndCache()` checks cache before fetching — already-cached pages are skipped (free resume)
- Progress callback fires after each page completes
- On complete: sets `localStorage` key `miftah:mushaf-downloaded` to current `cdnAssetVersion`
- On error: throws, but progress is preserved in the cache
- Per-asset retry: each `fetchAndCache` call retries up to 2 times with exponential backoff (1s, 3s) before failing the download
- Cancellable via existing `AbortController` pattern
- Concurrency guard: module-level `isDownloading` flag prevents duplicate downloads (React Strict Mode, navigation races)

#### `isMushafDownloaded(): MushafStatus`

Returns one of three states:

```typescript
type MushafStatus =
  | { readonly state: "complete" }
  | { readonly state: "partial"; readonly downloadedPages: number }
  | { readonly state: "none" };
```

**Fast path:** `localStorage.getItem("miftah:mushaf-downloaded") === currentVersion` → `{ state: "complete" }`.

**Slow path** (first visit, version mismatch, or iOS cache eviction): Count WebP entries in `mushaf-images-v1` cache AND verify `mushaf-data-v1` has >= 1812 entries (604 pages × 3 data assets: manifest, layout, translation). Both conditions must pass for `complete`.
- WebP count = 604 AND data count >= 1812 → set localStorage flag, return `complete`
- WebP count > 0 → return `partial` with WebP count
- WebP count = 0 → return `none`

**Important:** The slow path MUST write the localStorage flag on `complete` so it never runs twice. Subsequent navigations always hit the fast path.

#### `cancelDownload(): void`

Existing AbortController-based cancellation. Unchanged.

#### Concurrency

Batch 2 pages in parallel. Within each page, all 4 assets download in parallel. This yields up to 8 concurrent fetches — good throughput without overwhelming mobile devices.

```
downloadPage(page):
  urls = buildPageAssetUrls(page)
  await Promise.all([
    fetchAndCache(urls.webp, CACHE_IMAGES),
    fetchAndCache(urls.manifest, CACHE_DATA),
    fetchAndCache(urls.layout, CACHE_DATA),
    fetchAndCache(urls.translation, CACHE_DATA),
  ])

for page = 1 to 604, step 2:
  await Promise.all([
    downloadPage(page),
    downloadPage(page + 1),  // guarded: skip if > 604
  ])
  report progress (increment by pages completed in this batch)
```

This improves throughput ~3-4x over fully sequential while staying safe on mobile.

#### Preserved utilities

- `loadPwaConfig()` — unchanged
- `buildPageAssetUrls()` — unchanged
- `fetchAndCache()` — unchanged

#### Removed

- `downloadSurah()` — replaced by `downloadMushaf()`
- Import of `SURAH_PAGE_MAP` — no longer needed by engine

### Completion Check Module (`src/lib/pwa/mushafStatus.ts`)

New small module (extracted from engine for testability):

```typescript
export function isMushafDownloaded(): Promise<MushafStatus>
export function markMushafDownloaded(version: string): void
export function clearMushafDownloaded(): void
```

Uses `localStorage` key `miftah:mushaf-downloaded` and cache inspection as described above.

### Storage Quota and Persistence

Before starting the download, check available storage:

```typescript
const estimate = await navigator.storage.estimate();
const available = (estimate.quota ?? 0) - (estimate.usage ?? 0);
if (available < 150_000_000) {
  // Show warning: "Ruang storan tidak mencukupi (~150 MB diperlukan)"
  // Do not start download
}
```

Also request persistent storage to prevent iOS eviction:

```typescript
if (navigator.storage?.persist) {
  await navigator.storage.persist();
}
```

If quota is exceeded mid-download, catch the `QuotaExceededError` and show the error state with a clear message.

### Version Migration

When `cdnAssetVersion` changes (detected by localStorage flag mismatch):

1. Delete all entries from `mushaf-images-v1` and `mushaf-data-v1` caches
2. Clear the localStorage flag
3. Trigger a fresh download (user sees progress bar again)

This prevents cache bloat from old `?v=N` URLs accumulating alongside new `?v=N+1` URLs. The `app-shell-{BUILD_ID}` cache is already cleaned up by the service worker's activate handler.

### UI: `MushafDownloadPrompt` Component

**File:** `src/components/MushafDownloadPrompt.tsx`

Single component mounted in `layout.tsx`. Contains two visual states:

#### State 1: Prompt Card (home page only)

Shown when `isMushafDownloaded()` returns `"none"` and user is on `/`.

```
┌─────────────────────────────────────────┐
│ 📖 Muat turun Mushaf untuk bacaan       │
│    luar talian (~120 MB)                 │
│                                          │
│           [Muat turun]  [Nanti]          │
└─────────────────────────────────────────┘
```

- Positioned as a card within the home page content area, not a modal
- "Nanti" sets `localStorage` key `miftah:mushaf-dismissed` with a timestamp → hides for 24 hours (survives iOS PWA app switching, unlike sessionStorage)
- "Muat turun" sets `localStorage` key `miftah:mushaf-download-started = true` and starts download, transitions to progress bar
- Path-gated via `usePathname() === "/"` — never shows on /read, /faham, etc.

#### State 2: Progress Bar (all pages)

Shown when download is in progress (user tapped "Muat turun" or auto-resume triggered).

```
┌─────────────────────────────────────────┐
│ ████████████░░░░░░░  234/604 halaman    │
└─────────────────────────────────────────┘
```

- Fixed to bottom of screen, above `safe-area-inset-bottom`
- Thin bar (~44px height) — does not compete with mushaf reading surface
- Shows page count: "234/604 halaman"
- On complete: shows "Mushaf sedia luar talian ✓" for 3 seconds, then fades out
- On error: shows "Muat turun terganggu" with "Cuba semula" retry button
- Tappable × to minimize (download continues); small floating indicator remains
- Accessibility: `role="progressbar"`, `aria-valuenow`, `aria-valuemax="604"`, `aria-label="Memuat turun Mushaf"`

#### State 3: Hidden

When `isMushafDownloaded()` returns `"complete"` — renders nothing.

### Auto-Resume Logic

In `MushafDownloadPrompt` on mount:

```
status = await isMushafDownloaded()
started = localStorage.getItem("miftah:mushaf-download-started") === "true"

if status.state === "complete" → render nothing
if status.state === "partial" AND started → auto-resume downloadMushaf(), show progress bar
if status.state === "partial" AND !started → treat as "none" (user never opted in; partial from preloading or other source)
if status.state === "none" → show prompt card (home page) or nothing (other pages)
```

Auto-resume only triggers if the user previously tapped "Muat turun". This prevents surprise bandwidth usage from partial cache states the user didn't initiate.

### Layout Integration

In `src/app/layout.tsx`, add after existing PWA components:

```tsx
<ServiceWorkerRegistrar />
<ReadingStateSync />
<OfflineIndicator />
<UpdateBanner />
<PwaDebugLoader />
<MushafDownloadPrompt />   // ← new
```

### Debug Tools Update

Update `src/lib/pwa/debugTools.ts`:

```
window.__miftahDebug.downloadMushaf()   // trigger full download
window.__miftahDebug.mushafStatus()     // check download status
window.__miftahDebug.cancelDownload()   // cancel (unchanged)
window.__miftahDebug.clearDownload()    // clear localStorage flag + caches
```

Remove surah-specific debug commands (`downloadSurah`, `listPacks`).

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `src/lib/pwa/downloadEngine.ts` | Rewrite | `downloadMushaf()` replacing `downloadSurah()` |
| `src/lib/pwa/downloadEngine.test.ts` | Rewrite | Tests for new full-mushaf API |
| `src/lib/pwa/mushafStatus.ts` | New | `isMushafDownloaded()`, localStorage helpers |
| `src/lib/pwa/mushafStatus.test.ts` | New | Tests for status checking |
| `src/components/MushafDownloadPrompt.tsx` | New | Prompt card + progress bar + auto-resume |
| `src/lib/pwa/packDb.ts` | Delete | No longer needed; replaced by localStorage + cache |
| `src/lib/pwa/debugTools.ts` | Update | Replace surah commands with mushaf commands |
| `src/app/layout.tsx` | Update | Mount `<MushafDownloadPrompt />` |

## Files Unchanged

| File | Reason |
|------|--------|
| `public/sw.js` | Cache routing already handles all asset types |
| `src/lib/pwa/offlinePageData.ts` | Reads from cache; doesn't care how data got there |
| `src/lib/pwa/surahPageMap.ts` | Used by other features (hifz); not touched |
| `src/lib/pwa/swRegistration.ts` | SW lifecycle unchanged |
| `src/lib/pwa/packDb.ts` | Delete — no longer imported after engine rewrite |
| `src/components/OfflineIndicator.tsx` | Unchanged |
| `src/components/UpdateBanner.tsx` | Unchanged |
| Prebuild pipeline / `pwa-config.json` | Unchanged |

## Constraints

- Keep reading mode visually sacred — progress bar must be thin and non-intrusive
- No dependency on install event (iOS doesn't support `beforeinstallprompt`)
- Must work on both Chrome/Android and Safari/iOS
- Download must not block UI thread
- Must handle iOS cache eviction gracefully (re-download if flag mismatches)

## Success Criteria

- [ ] First visit to `/` shows download prompt
- [ ] Tapping "Muat turun" starts background download with visible progress
- [ ] User can navigate to /read, /faham, /hifz while download runs
- [ ] Closing and reopening the app resumes download automatically
- [ ] After completion, all 604 pages open offline with images, hitboxes, and translations
- [ ] Subsequent visits show no download UI
- [ ] iOS Safari add-to-home-screen works with full offline content
