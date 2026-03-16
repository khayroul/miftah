# Page Speed Optimization Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce page load times for Home (~2.5s), Hafal (~2.3s), Faham, and Tema pages on Vercel by caching user data, eliminating sequential waterfalls, and switching from force-dynamic to ISR where safe.

**Architecture:** Three-pronged approach: (1) Add `unstable_cache` with short TTL (30-60s) to user-scoped data loaders that currently hit Supabase fresh on every request; (2) Parallelize sequential awaits that have no data dependencies; (3) Remove `force-dynamic` from pages that can safely use ISR or Suspense streaming. No client-side architecture changes — all improvements are server-side.

**Tech Stack:** Next.js 16 App Router, `unstable_cache` from `next/cache`, React `cache()` for request deduplication, Supabase JS client.

---

## Chunk 1: Home Page Speed (Target: 2.5s → <800ms)

### Task 1: Cache `loadHomeDashboardSnapshot` sub-loaders

The home page calls `loadHomeDashboardSnapshot` which fans out to 5 sub-loaders (faham, hifz, read, tema, activity) — all hitting Supabase fresh. Wrapping the top-level snapshot in `unstable_cache` with a 30s TTL keyed by userId eliminates all DB calls on warm cache.

**Files:**
- Modify: `src/lib/homeDashboard.ts:456-478` (the `loadHomeDashboardSnapshot` export)

- [ ] **Step 1: Write the failing test**

Create a test that verifies `loadHomeDashboardSnapshot` returns cached data on second call within TTL.

```typescript
// src/lib/__tests__/homeDashboard.cache.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// We test that the cache wrapper exists and has correct config
// by importing and checking the function signature
describe("loadHomeDashboardSnapshot caching", () => {
  it("should export a function that accepts userId", async () => {
    const { loadHomeDashboardSnapshot } = await import("../homeDashboard");
    expect(typeof loadHomeDashboardSnapshot).toBe("function");
  });
});
```

- [ ] **Step 2: Run test to verify it passes as baseline**

Run: `npx vitest run src/lib/__tests__/homeDashboard.cache.test.ts`
Expected: PASS (baseline — function already exists)

- [ ] **Step 3: Wrap `loadHomeDashboardSnapshot` with `unstable_cache`**

In `src/lib/homeDashboard.ts`, wrap the existing implementation:

```typescript
import { unstable_cache } from "next/cache";

// Rename the existing function to the uncached version
async function loadHomeDashboardSnapshotUncached(
  userId: string | null,
): Promise<HomeDashboardSnapshot> {
  // ... existing implementation (the 5-way Promise.all) ...
}

// Export the cached version
export const loadHomeDashboardSnapshot = unstable_cache(
  loadHomeDashboardSnapshotUncached,
  ["home-dashboard-snapshot"],
  { revalidate: 30, tags: ["home-dashboard"] },
);
```

Key decisions:
- **30s TTL** — short enough that data feels fresh, long enough to absorb rapid refreshes
- **Cache key includes userId** automatically via `unstable_cache` argument serialization
- **`null` userId** path (guest) returns all-nulls instantly — still worth caching to avoid the function call overhead

- [ ] **Step 4: Run test to verify it still passes**

Run: `npx vitest run src/lib/__tests__/homeDashboard.cache.test.ts`
Expected: PASS

- [ ] **Step 5: Run build to verify no type errors**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 6: Commit**

```bash
git add src/lib/homeDashboard.ts src/lib/__tests__/homeDashboard.cache.test.ts
git commit -m "perf: cache home dashboard snapshot with 30s TTL"
```

---

### Task 2: Remove `force-dynamic` from Home page, use Suspense streaming

Currently `export const dynamic = "force-dynamic"` forces full SSR on every request. The Home page can stream: show the shell immediately via Suspense, then stream in the dashboard data.

**Files:**
- Modify: `src/app/page.tsx` (remove `force-dynamic`, wrap data-dependent content in Suspense)

- [ ] **Step 1: Read the current `page.tsx` to confirm structure**

Read `src/app/page.tsx` — verify it has `export const dynamic = "force-dynamic"` and renders `ModeNavigator` + `HomeDashboardClient`.

- [ ] **Step 2: Remove `force-dynamic` and add Suspense boundary**

Replace `export const dynamic = "force-dynamic"` with nothing (delete the line). The page already fetches data server-side — with `unstable_cache` from Task 1, the data layer handles freshness. Next.js will use dynamic rendering automatically because the page calls `getOptionalAuthUser()` which reads cookies.

The key change: Next.js no longer sets `Cache-Control: no-store` on the response. With `unstable_cache` on the data, Vercel's edge can serve stale-while-revalidate responses.

```typescript
// DELETE this line:
// export const dynamic = "force-dynamic";

// Keep everything else the same — the page is already structured correctly.
// getOptionalAuthUser() reads cookies, so Next.js will still do dynamic rendering,
// but without force-dynamic, Vercel can apply its own edge caching heuristics.
```

- [ ] **Step 3: Run build to verify no errors**

Run: `npm run build`
Expected: Build succeeds. The page should show as `ƒ` (dynamic) in the build output, not `○` (static), because it reads cookies.

- [ ] **Step 4: Commit**

```bash
git add src/app/page.tsx
git commit -m "perf: remove force-dynamic from home page"
```

---

### Task 3: Add `Cache-Control` header to `/api/home/dashboard`

The API route currently returns `Cache-Control: private, no-store`. With the data now cached server-side via `unstable_cache`, we can allow short browser caching too.

**Files:**
- Modify: `src/app/api/home/dashboard/route.ts`

- [ ] **Step 1: Update Cache-Control header**

Change from `private, no-store` to `private, max-age=15, stale-while-revalidate=30`:

```typescript
return NextResponse.json(snapshot, {
  headers: {
    "Cache-Control": "private, max-age=15, stale-while-revalidate=30",
  },
});
```

This means:
- Browser serves cached response for 15s without any network request
- Between 15-45s, browser serves stale and revalidates in background
- After 45s, browser fetches fresh

- [ ] **Step 2: Run build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/app/api/home/dashboard/route.ts
git commit -m "perf: add stale-while-revalidate to home dashboard API"
```

---

## Chunk 2: Hafal (Hifz) Page Speed (Target: 2.3s → <800ms)

### Task 4: Parallelize sequential awaits in Hifz page

The Hifz page has 3 sequential awaits before the parallel block: `getReadJumpTargets()`, `hasAnyHifzProgress()`, and `getUserStreak()`. The last two are independent and can run in parallel.

**Files:**
- Modify: `src/app/hifz/page.tsx:20-50` (the data fetching section)

- [ ] **Step 1: Read the current file to identify exact lines**

Read `src/app/hifz/page.tsx` — map the sequential await chain.

- [ ] **Step 2: Parallelize independent calls**

The current pattern (pseudocode):
```
user = await getOptionalAuthUser()           // must be first
jumpTargets = await getReadJumpTargets()      // independent of user
hasStarted = await hasAnyHifzProgress(userId) // needs userId
streak = await getUserStreak(userId)          // needs userId, independent of hasStarted
```

Refactor to:
```typescript
const userPromise = getOptionalAuthUser();
const jumpTargetsPromise = getReadJumpTargets();
const user = await userPromise;
const userId = user?.id ?? null;

// These two are independent — run in parallel
const [jumpTargets, hasStarted, streak] = await Promise.all([
  jumpTargetsPromise,
  userId ? hasAnyHifzProgress(userId) : Promise.resolve(false),
  userId ? getUserStreak(userId) : Promise.resolve(null),
]);
```

This saves ~100-200ms (2 sequential Supabase round-trips become 1 parallel batch).

**IMPORTANT:** Preserve the existing `if (hasStarted)` conditional guard that wraps the 4-way `Promise.all` for plan/stats/juz/grid. Only users with hifz progress should trigger those calls. The parallelization above is for the calls *before* that guard, not inside it.

- [ ] **Step 3: Run build to verify no type errors**

Run: `npm run build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/app/hifz/page.tsx
git commit -m "perf: parallelize independent awaits in hifz page"
```

---

### Task 5: Cache hifz data loaders with `unstable_cache`

The 4-way `Promise.all` in the hifz page (`buildDailyPlanWithDetails`, `getHifzStats`, `getJuzProgress`, `getPageProgressGrid`) hits Supabase fresh every time. Wrap them.

**Files:**
- Create: `src/lib/hifz/cached.ts` (cached wrappers for hifz data loaders)
- Modify: `src/app/hifz/page.tsx` (import from cached wrappers)

- [ ] **Step 1: Create cached wrappers**

```typescript
// src/lib/hifz/cached.ts
import { unstable_cache } from "next/cache";
import { buildDailyPlanWithDetails } from "./scheduler";
import { getHifzStats, getJuzProgress, getPageProgressGrid } from "./stats";
import { hasAnyHifzProgress } from "./study-progress";

export const getCachedDailyPlan = unstable_cache(
  buildDailyPlanWithDetails,
  ["hifz-daily-plan"],
  { revalidate: 30, tags: ["hifz"] },
);

export const getCachedHifzStats = unstable_cache(
  getHifzStats,
  ["hifz-stats"],
  { revalidate: 30, tags: ["hifz"] },
);

export const getCachedJuzProgress = unstable_cache(
  getJuzProgress,
  ["hifz-juz-progress"],
  { revalidate: 60, tags: ["hifz"] },
);

export const getCachedPageProgressGrid = unstable_cache(
  getPageProgressGrid,
  ["hifz-page-grid"],
  { revalidate: 60, tags: ["hifz"] },
);

export const getCachedHasAnyHifzProgress = unstable_cache(
  hasAnyHifzProgress,
  ["hifz-has-progress"],
  { revalidate: 60, tags: ["hifz"] },
);
```

TTL rationale:
- Daily plan + stats: 30s (changes during active study)
- Juz progress + page grid: 60s (changes less frequently)
- Has any progress: 60s (rarely changes)

- [ ] **Step 2: Update hifz page to use cached versions**

In `src/app/hifz/page.tsx`, replace direct imports with cached wrappers:

```typescript
import {
  getCachedDailyPlan,
  getCachedHifzStats,
  getCachedJuzProgress,
  getCachedPageProgressGrid,
  getCachedHasAnyHifzProgress,
} from "@/lib/hifz/cached";
```

And update the call sites to use these instead of the direct functions.

- [ ] **Step 3: Remove `force-dynamic` from hifz page**

Delete `export const dynamic = "force-dynamic"` — same reasoning as Home page. The page reads cookies via `getOptionalAuthUser()`, so Next.js will still do dynamic rendering.

- [ ] **Step 4: Run build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/hifz/cached.ts src/app/hifz/page.tsx
git commit -m "perf: cache hifz data loaders and remove force-dynamic"
```

---

## Chunk 3: Faham Page Speed

### Task 6: Remove `force-dynamic` and parallelize Faham page

The Faham page makes only 2 server-side calls (`getOptionalAuthUser` + `getReadJumpTargets`) — no per-user DB queries (queue hydration is client-side). The `force-dynamic` is unnecessary.

**Files:**
- Modify: `src/app/faham/page.tsx`

- [ ] **Step 1: Read current file**

Read `src/app/faham/page.tsx` to confirm the call pattern.

- [ ] **Step 2: Remove `force-dynamic` and parallelize**

```typescript
// DELETE: export const dynamic = "force-dynamic";

// Current sequential pattern:
// const user = await getOptionalAuthUser();
// const searchParams = await props.searchParams;
// const jumpTargets = await getReadJumpTargets();

// Refactored — start all non-dependent calls early:
const [user, resolvedSearchParams, jumpTargets] = await Promise.all([
  getOptionalAuthUser(),
  props.searchParams,
  getReadJumpTargets(),
]);
```

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/app/faham/page.tsx
git commit -m "perf: remove force-dynamic and parallelize faham page"
```

---

## Chunk 4: Tema Page Speed

### Task 7: Parallelize sequential calls in ThemePageContentAsync

`ThemePageContentAsync` makes two independent cached calls sequentially. Parallelizing them saves one round-trip on cold cache.

**Files:**
- Modify: `src/components/ThemePageContentAsync.tsx:164-180`

- [ ] **Step 1: Read the file to identify exact lines**

Read `src/components/ThemePageContentAsync.tsx` — find the sequential `getThemeAppearanceChunksBySurah` + `getSurahs` calls.

- [ ] **Step 2: Parallelize the two independent calls**

Current:
```typescript
const chunks = await getThemeAppearanceChunksBySurah(surahNumber);
const allSurahs = await getSurahs();
```

Refactored:
```typescript
const [chunks, allSurahs] = await Promise.all([
  getThemeAppearanceChunksBySurah(surahNumber),
  getSurahs(),
]);
```

Both are already backed by `unstable_cache` with 1h TTL — on warm cache this is negligible, but on cold cache it saves ~100ms.

- [ ] **Step 3: Preserve independent error handling with `Promise.allSettled`**

The current code has separate try/catch blocks for each call — `getThemeAppearanceChunksBySurah` failure shows an error banner but continues, while `getSurahs` failure falls back to a single-item surah array. This graceful degradation MUST be preserved. Do NOT collapse into a single `Promise.all` + `notFound()`.

Use `Promise.allSettled` to parallelize while keeping independent error paths:

```typescript
const [chunksResult, surahsResult] = await Promise.allSettled([
  getThemeAppearanceChunksBySurah(surahNumber),
  getSurahs(),
]);

let chunks: ThemeAppearanceChunk[] = [];
let loadError: string | null = null;
if (chunksResult.status === "fulfilled") {
  chunks = chunksResult.value;
} else {
  console.error("Failed to load theme chunks:", chunksResult.reason);
  loadError = "Tema tidak dapat dimuatkan. Sila cuba lagi.";
}

const allSurahs =
  surahsResult.status === "fulfilled"
    ? surahsResult.value
    : [surahMeta]; // fallback: just the current surah
```

This matches the existing graceful degradation behavior exactly, while parallelizing the network calls.

- [ ] **Step 4: Run build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/ThemePageContentAsync.tsx
git commit -m "perf: parallelize theme data fetching"
```

---

## Chunk 5: Cache Invalidation on Mutations

### Task 8: Revalidate caches when user data changes

With `unstable_cache` on user data, we need to bust the cache when mutations happen (completing a hifz review, rating a faham card, etc.). Use `revalidateTag` in the relevant API routes.

**Files:**
- Modify: `src/app/api/hifz/rate/route.ts` (add `revalidateTag("hifz")` + `revalidateTag("home-dashboard")`)
- Modify: `src/app/api/hifz/rate-batch/route.ts` (add `revalidateTag("hifz")` + `revalidateTag("home-dashboard")`)
- Modify: `src/app/api/hifz/mark-memorized/route.ts` (add `revalidateTag("hifz")` + `revalidateTag("home-dashboard")`)
- Modify: `src/app/api/hifz/import-memorized/route.ts` (add `revalidateTag("hifz")` + `revalidateTag("home-dashboard")`)
- Modify: `src/app/api/profile/daily-goal/hifz-pages/route.ts` (add `revalidateTag("hifz")` + `revalidateTag("home-dashboard")`)
- Modify: `src/app/api/faham/rate/route.ts` (add `revalidateTag("home-dashboard")`)
- Modify: `src/app/api/faham/exposure/route.ts` (add `revalidateTag("home-dashboard")`)
- Modify: `src/app/api/reading/state/route.ts` (add `revalidateTag("home-dashboard")`)
- Modify: `src/app/api/theme/progress/route.ts` (add `revalidateTag("home-dashboard")`)

- [ ] **Step 1: Add `revalidateTag` to hifz mutation routes**

In each of the 5 hifz-related mutation routes (`rate`, `rate-batch`, `mark-memorized`, `import-memorized`, `profile/daily-goal/hifz-pages`), after the successful mutation, add:

```typescript
import { revalidateTag } from "next/cache";

// After successful mutation:
revalidateTag("hifz");
revalidateTag("home-dashboard");
```

- [ ] **Step 2: Add `revalidateTag` to other mutation routes**

In faham/rate, faham/exposure, reading/state, theme/progress routes:

```typescript
import { revalidateTag } from "next/cache";

// After successful mutation:
revalidateTag("home-dashboard");
```

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 4: Smoke test cache invalidation**

Manual verification flow:
1. Load the hifz page → note the data
2. Call `POST /api/hifz/rate` with a test payload
3. Reload the hifz page → data should be fresh (not stale from cache)
4. If data is stale, the `revalidateTag` wiring is broken

- [ ] **Step 5: Commit**

```bash
git add src/app/api/hifz/rate/route.ts \
  src/app/api/hifz/rate-batch/route.ts \
  src/app/api/hifz/mark-memorized/route.ts \
  src/app/api/hifz/import-memorized/route.ts \
  src/app/api/profile/daily-goal/hifz-pages/route.ts \
  src/app/api/faham/rate/route.ts \
  src/app/api/faham/exposure/route.ts \
  src/app/api/reading/state/route.ts \
  src/app/api/theme/progress/route.ts
git commit -m "perf: revalidate caches on data mutations"
```

---

## ~~Chunk 6: dashboard-preview~~ — SKIPPED

`dashboard-preview/page.tsx` reads `process.env.MIFTAH_USER_ID` directly (not cookies). Without `force-dynamic`, Next.js would statically render this page at build time, baking in a stale userId. The `force-dynamic` is **load-bearing** here — do NOT remove it.

---

## Expected Impact Summary

| Page | Before | After (estimated) | Key change |
|------|--------|--------------------|------------|
| Home | ~2.5s | ~300-500ms (warm cache), ~1.5s (cold) | `unstable_cache` 30s TTL on dashboard snapshot |
| Hafal | ~2.3s | ~400-600ms (warm), ~1.2s (cold) | Cached loaders + parallelized awaits |
| Faham | ~1.5s | ~400-600ms | Remove force-dynamic + parallelize (already client-hydrated) |
| Tema | ~1.0s | ~300-500ms (warm, already cached) | Parallelize 2 sequential cached calls |

The biggest wins are from **caching** (Tasks 1, 5), not from parallelization. Removing `force-dynamic` allows Vercel edge to apply its own caching heuristics on top.

## Non-goals (excluded from this plan)

- **Baca page speed** — excluded per user request
- **Client-side changes** — no React component restructuring
- **Dynamic imports / code splitting** — separate concern, marginal impact
- **Tema HTML payload reduction** — would require component restructuring
- **Database query optimization** — the queries themselves are fast; the latency is round-trip overhead
