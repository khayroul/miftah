# Offline Tema Support — Design Spec

**Date:** 2026-03-27
**Status:** Draft
**Depends on:** Full mushaf download (PR #6, merged)

## Problem

The Tema feature requires 4 live Supabase queries per surah. When offline, the server component fails and shows "Tema tidak dapat dimuatkan." Users who downloaded the mushaf for offline reading expect tema to work too.

## Solution

Bundle tema data (theme chunks + word-by-word) into the existing mushaf download. A new API route `/api/tema/[surah]` serves pre-computed JSON. The download engine pre-fetches all 114 surahs. The service worker intercepts browser-side fetches and serves from cache when offline.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Download model | Bundle with mushaf download | Extra ~35-55 MB is marginal on 120 MB; avoids second prompt |
| Offline serving | API route + service worker | Single data path; SW handles caching transparently |
| WBW data | Include | Full offline experience; users expect complete tema |
| API shape | Single `/api/tema/[surah]` endpoint | One fetch per surah; simpler SW routing and cache |
| Cache versioning | Separate `temaDataVersion` | Tema content evolves independently from mushaf images |
| Existing users | Auto-resume downloads tema silently | User already opted in; partial state triggers auto-resume |
| Rendering model | Client-side data fetching | SW can only intercept browser-side fetches, not server component fetches |

## API Route: `/api/tema/[surah]`

### Request

```
GET /api/tema/42
```

### Response

```typescript
interface TemaApiResponse {
  readonly surahId: number;
  readonly chunks: ThemeAppearanceChunk[];
  readonly wbw: Record<number, AyahWordByWordEntry[]>; // keyed by ayah ID
  readonly prevSurahChunkCount: number | null; // null for surah 1
}
```

Calls existing `getThemeAppearanceChunksBySurah()` and `getWordByWordForAyahIds()`. No new database logic.

The response also includes `prevSurahChunkCount: number | null` — the chunk count of the previous surah (null for surah 1). This allows cross-surah "back" navigation without a second fetch.

### Error handling

- Invalid surah (< 1 or > 114): 400
- Supabase fetch failure: 500 with `{ error: "..." }`

## Cache Architecture

### Cache name

`tema-data-v1` — separate from mushaf image and data caches.

### pwa-config.json

Add `temaDataVersion` field (optional during rollout, required after first deploy):

```json
{
  "cdnAssetVersion": "4",
  "temaDataVersion": "1",
  "supabaseStorageBase": "...",
  "pagesBucket": "mushaf-pages",
  "manifestsBucket": "mushaf-manifests"
}
```

The `PwaConfig` interface adds `temaDataVersion?: string`. The `isPwaConfig()` guard treats it as optional for backward compatibility. The download engine skips tema phase if `temaDataVersion` is absent. The `loadPwaConfig()` function returns the extended config; callers access `config.temaDataVersion` to build the composite version string and decide whether to run phase 2.

### Version migration

Replace the existing `migrateIfVersionChanged()` with a single function that understands the composite version format `"cdnAssetVersion:temaDataVersion"`:

- Parse the stored composite value into its two parts
- If `cdnAssetVersion` changed: delete mushaf image + data caches
- If `temaDataVersion` changed: delete tema cache only
- If either changed: clear the downloaded flag (triggers re-download of affected data)
- Old format stored values (e.g., `"4"` without colon) are treated as `cdnAssetVersion` only with no tema version, triggering tema download

### Service worker routing

Add `TEMA_DATA_CACHE = "tema-data-v1"` constant in `sw.js` alongside the existing cache name constants. Add a `matchesTemaData(url)` helper and cache-first handler for `/api/tema/*`, matching the existing pattern for mushaf data:

```
/api/tema/* → cache-first (tema-data-v1) → network fallback
```

The activate handler should also clean old tema caches (e.g., `tema-data-v0`) on version change, same pattern as `app-shell-*` cleanup.

## Download Engine Changes

### Extended download flow

`downloadMushaf()` gains a second phase:

1. **Phase 1 (existing):** Download 604 mushaf pages (images + manifests + layouts + translations)
2. **Phase 2 (new):** Download 114 tema endpoints (`/api/tema/1` through `/api/tema/114`)

Same batch concurrency (2 concurrent requests), same retry-with-backoff.

Phase 1 pages that are already cached are skipped (existing `fetchAndCache` checks). For existing users who already have all 604 pages, add a fast-skip: before starting phase 1, check image cache entry count — if ≥604, skip phase 1 entirely rather than checking each URL individually (avoids 2,416 serial cache lookups). Phase 2 then downloads the 114 tema endpoints.

### Progress tracking

Total download units: 604 pages + 114 tema = 718 total.

Rename the progress fields from `downloadedPages`/`totalPages` to `completedItems`/`totalItems` to reflect that the units now include both pages and tema endpoints:

```typescript
type MushafDownloadProgress = {
  readonly completedItems: number;
  readonly totalItems: number; // 718
};
```

The UI shows a single unified progress bar with percentage display (not "X/Y halaman" which would be misleading when tema endpoints are included).

Update `MushafDownloadPrompt`:
- Replace `{downloadedPages}/{TOTAL_PAGES} halaman` with `{percentage}%` display
- Update `aria-valuemax` to 718
- Update `aria-label` from "Memuat turun Mushaf" to "Memuat turun data Miftah"

### Storage quota

Update `REQUIRED_BYTES` from 150 MB to 200 MB to account for tema + WBW data. Also update the hardcoded error message string from "~150 MB diperlukan" to "~200 MB diperlukan".

## Status Tracking Changes

### localStorage format change

Change the downloaded flag value from a single version to a composite:

```
Before: miftah:mushaf-downloaded = "4"        (cdnAssetVersion only)
After:  miftah:mushaf-downloaded = "4:1"       (cdnAssetVersion:temaDataVersion)
```

This ensures bumping either version invalidates the fast path.

### `isMushafDownloaded()` updates

**Signature change:** `isMushafDownloaded()` now takes both versions: `isMushafDownloaded(cdnAssetVersion: string, temaDataVersion: string)`. All callers (`MushafDownloadPrompt`, `debugTools`) must be updated.

**`MushafStatus` type update:** Rename `downloadedPages` to `completedItems` in the partial state to match the progress type:

```typescript
export type MushafStatus =
  | { readonly state: "complete" }
  | { readonly state: "partial"; readonly completedItems: number }
  | { readonly state: "none" };
```

**`markMushafDownloaded()` update:** Signature changes to `markMushafDownloaded(cdnAssetVersion: string, temaDataVersion: string)`. Writes the composite format `"${cdnAssetVersion}:${temaDataVersion}"` to localStorage. The download engine calls this after both phases complete.

**Fast path:** Compare stored value against `"${cdnAssetVersion}:${temaDataVersion}"`. Only returns "complete" if both versions match.

**Slow path** checks all three caches:
- Image cache: ≥604 WebP entries
- Data cache: ≥1,812 entries (604 × 3)
- **Tema cache: ≥114 entries** (new)

All three must pass for `state: "complete"`. If pages are complete but tema is missing, returns `state: "partial"`.

The `downloadedPages` field in partial state reflects total progress across both phases. The slow path counts entries from three separate caches and sums: image cache WebP count (up to 604) + tema cache entry count (up to 114) = progress out of 718. Data cache (manifests/layouts/translations) is not counted separately — it tracks with image cache as 3:1 ratio and is verified only for the "complete" check.

### Existing user migration

Users with `miftah:mushaf-downloaded = "4"` (old format, no tema version):
1. Fast path: stored `"4"` does not match expected `"4:1"` → falls through to slow path
2. Slow path: pages complete (604 images + 1812 data), tema cache empty (0 entries) → returns `{ state: "partial", completedItems: 604 }`
3. `hasUserStartedDownload()` returns true
4. `MushafDownloadPrompt` auto-resumes → download engine skips phase 1 (pages already cached) → downloads phase 2 (tema)
5. Progress bar shows tema download progress starting from ~84% (604/718)

No special migration code needed — the composite version format and existing partial/auto-resume flow handle it.

## Tema Page Rendering Changes

### Why server component fetch won't work

`ThemePageContentAsync` is an async server component — it runs on Node.js during RSC streaming. Server components cannot reliably fetch same-origin API routes (no browser context, self-referential request issues). The service worker only intercepts browser-initiated requests, not server-side fetches.

### Hybrid rendering approach

Split the tema page into server shell + client data fetcher:

1. **Server component (page.tsx):** Renders the page shell — navigation, surah header, layout structure, loading skeleton. No data fetching.

2. **New client component (`TemaDataFetcher.tsx`):** Mounted inside the server shell. On mount, fetches `/api/tema/[surah]` from the browser. The SW intercepts this fetch and serves from cache when offline.

3. **Existing components** (`ThemeChunkAyahList`, etc.) receive data from the client component and render as before.

```
Server: page.tsx → shell + skeleton
         ↓
Client: TemaDataFetcher → fetch /api/tema/[surah]
         ↓                         ↓ (browser fetch)
         ↓                    SW intercepts → cache-first
         ↓
        ThemePageContent → renders chunks + WBW
```

### Trade-offs

- **Lost:** Server-side rendering of tema content (first paint shows skeleton instead of content)
- **Gained:** Full offline support; simpler single data path; SW caching works transparently
- **Acceptable because:** Tema pages are behind navigation (not entry pages), SEO is not critical for authenticated app content, and the skeleton provides immediate visual feedback

### ThemePageContentAsync refactor

Split into:
- `ThemePageContent.tsx` — pure rendering component (receives chunks + wbw as props)
- `TemaDataFetcher.tsx` — client component ("use client") that fetches `/api/tema/[surah]`, manages loading/error states, passes data to `ThemePageContent`

The existing `getThemeAppearanceChunksBySurah()` and `getWordByWordForAyahIds()` in `queries.ts` are still used — by the API route handler, not the client component.

## Storage Estimate

| Data | Size |
|------|------|
| Mushaf pages (existing) | ~120 MB |
| Tema chunks (114 surahs) | ~10-25 MB |
| WBW data (114 surahs) | ~25-30 MB |
| **Total** | **~155-175 MB** |

## Files Changed

| File | Change |
|------|--------|
| `src/app/api/tema/[surah]/route.ts` | New API route |
| `src/components/ThemePageContentAsync.tsx` | Refactor: extract pure rendering into `ThemePageContent.tsx` |
| `src/components/ThemePageContent.tsx` | New: pure rendering component (props-driven) |
| `src/components/TemaDataFetcher.tsx` | New: client component, fetches `/api/tema/[surah]` |
| `src/app/read/surah/[surah]/themes/page.tsx` | Mount `TemaDataFetcher` instead of `ThemePageContentAsync` |
| `src/lib/pwa/downloadEngine.ts` | Phase 2: download 114 tema endpoints; tema version migration; fast-skip phase 1; rename progress fields; update `REQUIRED_BYTES` |
| `src/lib/pwa/mushafStatus.ts` | Composite version format; dual-version signature; check tema cache in slow path |
| `src/components/MushafDownloadPrompt.tsx` | Percentage display; updated aria labels; updated prompt copy; adapt to renamed progress fields |
| `src/lib/pwa/debugTools.ts` | Update `mushafStatus()` for dual-version signature; `clearDownload()` must also delete `tema-data-v1` cache |
| `public/sw.js` | Add `TEMA_DATA_CACHE` constant; `matchesTemaData()` helper; cache-first routing; activate cleanup |
| `scripts/generate-pwa-config.ts` | Add `temaDataVersion` field |

## Not in scope

- Offline support for Faham or Hafal modes
- Background sync / periodic re-download
- Compression of cached responses (Vercel compresses API responses automatically)
- Static pre-rendering of tema pages

## Implementation Notes

### WBW in TemaDataFetcher

The API response includes WBW for all ayahs in the surah. `TemaDataFetcher` passes the full `wbw` map to `ThemePageContent`, which extracts only the selected chunk's ayah IDs when rendering `ThemeChunkAyahList`. No filtering needed at the fetcher level.

### Cross-surah navigation

The API response includes `prevSurahChunkCount` so `TemaDataFetcher` does not need a second fetch for cross-surah "back" navigation. The server shell passes the surah list as a prop (from `getSurahs()`) for forward navigation links.

### Error UI in TemaDataFetcher

Replicate the existing error banner ("Tema tidak dapat dimuatkan") with an added "Cuba semula" retry button, since client-side fetches can retry without full page navigation.

### Prompt text update

Update user-facing prompt copy in `MushafDownloadPrompt`:
- Change "~120 MB" to "~170 MB"
- Change "Mushaf" to "Mushaf dan Tema"

### SW cache matching

The API route should set `Cache-Control: no-transform` and avoid `Vary` headers that could cause cache misses. Add a `cacheFirstTema()` strategy function (or parameterize the existing `cacheFirstStrategy`) that passes `{ ignoreVary: true }` to `cache.match()` for `/api/tema/*` requests, since API routes may set `Vary` headers that differ between the download engine fetch and the browser fetch.
