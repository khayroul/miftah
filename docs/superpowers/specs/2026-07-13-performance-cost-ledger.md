# Miftah Performance & Cost Ledger — root-cause synthesis (2026-07-13)

**Instruction origin:** exhaustive perf+cost sweep of Miftah (PERF-A home · PERF-B read ·
PERF-C hifz · PERF-D supabase-global/cost · PERF-E frontend · PERF-F cross-cutting
patterns), built on the faham deep-dive `docs/superpowers/specs/2026-07-13-load-time-perf-audit.md`
(F1–F11). This ledger is the **single ranked synthesis** of all seven inputs.
**Consumed by:** the Control Tower (dispatch), the Phase-1 `data/` repository-layer wave
(the perf contract it is built to), and the operator (migrations + infra).
**Gate facts:** no prior ledger doc; no data-file writes; read-only synthesis. All project
facts trace to project `axjuolsguunsvqhmeveq` (Miftah, Postgres 17.6, `ap-southeast-1`),
via read-only MCP `EXPLAIN (ANALYZE, BUFFERS)` + static repo read.

**How to read this doc.** Findings are grouped by **root cause**, not by lane — each root
cause lists *every* instance across home/read/hifz/faham/tema/global so the Tower fixes a
class once. Every entry carries `[DIMENSION]` (latency | compute | egress | connections |
storage), `[FIX-LOCATION]` (apply-now-quick-win | data-layer-wave | frontend-phase2 |
infra-config | operator-deploy), and an impact estimate. Section 2 is the ranked table;
Section 3 the detail; Section 4 the three explicit action buckets; Section 5 the corrections
the sweep made to earlier assumptions; Section 6 the biggest-3 + the single #1; Section 7 the
one-paragraph repository-layer contract.

---

## 1. Sweep disclosures (surface to operator — read-only mandate)

Two lanes flagged an accidental `EXPLAIN ANALYZE`-on-write during measurement (ANALYZE
executes the statement; it is not a dry-run):

- **PERF-B (read):** an `EXPLAIN (ANALYZE)` wrapped a live `INSERT … ON CONFLICT DO UPDATE`
  and **actually upserted** `user_reading_state` for user `73c23cc4-…-d753617dc494`
  (`last_page` 585). Caught immediately; issued a corrective `UPDATE` restoring
  `last_page=1, last_read_at=2026-03-27T23:15:02.905Z`. **Residual:** the `updated_at`
  trigger stamped today's date (cosmetic — no code path treats `updated_at` as authoritative
  reading progress; could not be restored). No further writes taken pending review.
- **PERF-C (hifz):** an `EXPLAIN ANALYZE` ran on an `UPDATE` (promoteSabqiToManzil) but
  **matched 0 rows** for the hot user (no sabqi rows) → **no data mutated.** Flagged for
  completeness.

Everything else in all seven inputs is SELECT / EXPLAIN-on-SELECT only.

---

## 2. Root-cause ledger — ranked by impact × breadth

| Rank | Root cause (ID) | Instances (surfaces) | Dimensions | Fix-location | Headline impact |
|---|---|---|---|---|---|
| **1** | **RC-A · Re-aggregating non-materialized views every call** | faham `v_vocab_exposure_summary`; hifz `v_hifz_page_progress`; tema JS-side distinct-count; home (both, via snapshot); `v_daily_activity_summary`; dead `v_word_rank_coverage` | compute, latency | data-layer-wave (+ quick-win drop of dead view) | 227 ms×4 + 101 ms + 88 ms (faham) & 232 ms cold ×3 (hifz) collapsed to ~1 ms; the #1 compute line |
| **2** | **RC-B · Missing request-level caching / memoization** | 18/22 lib files uncached; `getFahamLevelState` ×2–4; home `dashboard_snapshot` never written back (0/71 fresh); read fires full recompute per page-turn | latency, compute | data-layer-wave + apply-now (write-back) | Home cold ~45 round-trips → 3 on repeat; kills F1/F5/F8 duplicate recomputes; root multiplier |
| **3** | **RC-C · Over-fetching full text/columns/rows when only ids/counts needed** | faham `word_occurrences` embed (6 sites, 517 ms); 25 `select("*")`; home `enrichWithAyahDetails`; hifz plan; read personalization + audio-tracks; tema; `import-memorized` IN-list | egress, compute, latency | data-layer-wave (+ quick-wins) | 517 ms single query; ~246 KB/audio-expand, ~36 KB/personalization, ~17 KB/home load discarded |
| **4** | **RC-E · Double `auth.getUser()` per request** | app-wide: middleware `updateSupabaseSession` + every route's `getOptionalAuthUser` + RSC | latency (connections) | apply-now-quick-win | 2 GoTrue network round-trips on **every** authenticated request — highest-frequency tax |
| **5** | **RC-D · Serialized N+1 writes** | hifz `rate-batch` (~250 round-trips) + `mark-memorized`; faham `materializeNewFahamCards`; double-recompute per memorize chunk | latency, connections | quick-win (Promise.all) → data-layer-wave (batched RPC) | Worst tail: ~250 sequential → ~4 round-trips per rating batch |
| **6** | **RC-H · Unapplied index migration + missing indexes** | `20260713130000_perf_indexes.sql` NOT live (G0); `words(frequency)`, 3 FK indexes, 1 duplicate index, 7 more unindexed FKs | latency, compute, storage | operator-deploy + apply-now | Prerequisite: 5 "believed-done" fixes are live-unfixed; premise-correcting |
| **7** | **RC-F · GET requests with write side-effects** | home + hifz: `promoteSabqiToManzil` UPDATE runs synchronously, blocking, on every cold load | latency, compute | data-layer-wave | 1 blocking write serialized ahead of the read batch, every cold load (correctness) |
| **8** | **RC-G · Independent awaits run sequentially (Promise.all)** | dashboard-preview; middleware rate-limit+session; `activity.ts` ×3; tema route; reading/state route | latency | apply-now-quick-win | ~280–300 ms avoidable on dashboard-preview; 1 round-trip each elsewhere; free |
| **9** | **RC-I · Dead code / phantom RPC / dead tables-views-endpoints** | hifz phantom RPC `get_last_review_per_page` + `user_streaks`; home `user_activity_log` legacy reads + dead `/api/home/dashboard` + `ContinueReadingCard`; dead `v_word_rank_coverage`; dead `getWordsForAyah` | latency, compute, storage | apply-now-quick-win | 1–2 wasted round-trips/load + a permanently-null UI field; hygiene |
| **10** | **RC-J · Frontend weight / asset optimization** | font TTF→woff2 (all read/faham/tema routes); `mushaf-pages` image bucket 531 MB; monolithic FahamWorkspace/HifzMemorizeStepper; tema client-fetch | egress, latency | apply-now (font) + frontend-phase2 + infra-config (images) | ~39 KB/load (font); 531 MB image egress lever |
| **11** | **RC-K · RLS initplan per-row re-eval (future)** | 25 `auth_rls_initplan` WARN across 11 user tables | compute | data-layer-wave, **gated on Phase-2 RLS activation** | Inert today (service-role bypass); per-row `auth.uid()` storm once RLS goes live |

---

## 3. Root-cause detail

### RC-A — Re-aggregating non-materialized views on every call
**[DIMENSION: compute, latency] [FIX: data-layer-wave; drop dead view = apply-now]**
All 5 `v_*` views are **plain (non-materialized)** — each re-aggregates from base tables on
every call.

- **`v_vocab_exposure_summary`** — faham F3/F2. `GROUP BY user_id,word_id` over 36,644–37,638
  `vocab_exposure_events` rows, 12 agg exprs. **88–227 ms**, called 3–4×/faham load from 4
  sites (`repository.ts:338,608`, `levels.ts:144`, `homeDashboard.ts:220`). `countFoundWords`
  filters the view's *computed* `reading_event_count>0` → defeats every index → **Seq Scan of
  37,638 rows ×4 per level-state build**. The single #1 compute hog.
- **`v_hifz_page_progress`** — PERF-C H2 / PERF-A "also observed". `page_meta` CTE **Seq Scans
  the full `ayat` table (6,236 rows)** + HashAggregate on *every* call — the expensive part is
  **user-independent** (Quran page/juz layout is static), yet hit **3× concurrently per hifz
  load** (`stats.ts:32,97,147`). **232 ms cold / 8–12 ms warm.**
- **tema `exploredCount`** — home F-HOME-4. `loadTemaSnapshot` fetches **4,085
  `vocab_exposure_events.source_key` rows to compute `count(distinct)=24` in JS — a 170:1
  waste**. PostgREST can't express `COUNT(DISTINCT)`; needs a view/RPC/rollup. Same
  re-aggregate-in-app anti-pattern as F3.
- **`v_daily_activity_summary`** — LOW today (small base) but grows linearly with
  `activity_events`; revisit past ~100k rows.
- **`v_juz_progress`** — LOW (4.9 ms), fine for now; optional matview alongside hifz.
- **`v_word_rank_coverage`** — **DEAD** (zero `src/` references). A `rank() OVER (ORDER BY
  frequency DESC)` window over all 21,977 words that can't push a user filter down (49 ms,
  `Rows Removed by Filter: 22,201`). **DROP it** (apply-now).

**Fix:** maintain a per-`(user,word)` **rollup table** for `v_vocab_exposure_summary` updated
on exposure-write (or MATERIALIZED VIEW refreshed in the existing `after()` hook) — collapses
F2 + candidates + stats-count at once. Materialize `page_meta` as a tiny static lookup (604
rows) for hifz. Add a DB-side distinct-count for tema.

### RC-B — Missing request-level caching / memoization
**[DIMENSION: latency, compute] [FIX: data-layer-wave; snapshot write-back = apply-now]**
The systemic root: **18 of 22 query-bearing `src/lib/**` files carry zero `cache()` /
`unstable_cache`** (PERF-F P6). React `cache()` only dedupes within one HTTP request — and
`/faham` fires `/queue` and `/stats` as **two separate requests**, so nothing survives across
them. Consequences:

- **`getFahamLevelState` computed twice per faham load** (F1) — 12 queries ×2 = 24, incl. 8×
  227 ms seq-scans — and **again per card advance**, plus a 4th uncached call site
  (`tier-vocab`, PERF-F P5). Home cold path duplicates it a 5th time (F8).
- **`getTopFahamWordIds`** is React-`cache()`'d but that can't cross the queue/stats request
  boundary → the 10.7 ms sort-scan re-runs fresh in each request.
- **Home `dashboard_snapshot` 5-min cache is a paper tiger (F-HOME-1):** `loadDashboardWithDbCache`
  only ever *reads* `profiles.dashboard_snapshot`; it never writes one back on the cold-compute
  path (the only writer is `recomputeAndStoreSnapshot`, called from `after()` on 9 *mutation*
  routes). Measured: **0/71 profiles have a fresh snapshot; newest is 3 d 19 h stale.** So
  **every** home load takes the cold ~43-Postgres + 2-Auth ≈ **45-round-trip** path.
- **Read surface is the highest-frequency trigger** of the full 5-way snapshot recompute
  (F-READ-3): `POST /api/reading/state`'s `after()` fires `recomputeAndStoreSnapshot` **once
  per page-turn** — a 20-page session = 20× the expensive recompute, undermining the 30 s
  `unstable_cache` sitting one function call away.

**Fix:** (1) **APPLY-NOW:** in `loadDashboardWithDbCache`'s miss branch, `after(() =>
writeSnapshot(userId, snapshot))` reusing the just-computed object — turns repeat home loads
within 5 min into 3 round-trips. (2) **DATA-LAYER:** every pure-read repository export wrapped
in `unstable_cache` (explicit tag + short TTL) by convention, enforced by a grep-gate; gate
the read-surface recompute behind a debounce/threshold (or the cached, not `*Uncached*`,
variant).

### RC-C — Over-fetching (full text / all columns / all rows when only ids or counts are used)
**[DIMENSION: egress, compute, latency] [FIX: data-layer-wave; several apply-now]**

- **`word_occurrences(…ayat…)` embedded over-fetch** — faham F4 / PERF-F P3. 6 identical sites
  in `faham/repository.ts` (`getDue/Mastered/Learning/Bootstrap/McqPool` + candidates) pull
  **every** occurrence of each word then use only `firstRelation()`. **517 ms / 560 rows for 9
  due words.** The most expensive single query in the corpus.
- **`select("*")` — 25 sites** (PERF-F P2, ~⅓ of all select calls). `hifz/study-progress.ts`
  alone = 8; `study_progress`/`vocab_progress` rows carry 11+ FSRS columns. Two are
  **client-side** (`fetchExpandedAudioTracks.ts`) shipping full `ayat` rows to the browser.
- **Home `enrichWithAyahDetails`** (F-HOME-3) ships full `text_uthmani` (avg 112, max 1189
  chars) + `display_bm` (avg 232) for ~40–50 ayat to compute **2 integers + a couple of
  labels** — ~**17 KB Arabic/Malay text discarded per cold home load**.
- **Hifz `buildDailyPlanWithDetails`** (H3) selects the same wide text + a `surahs` join for
  count-only call sites (`page.tsx`, `queue`) that read only `id/page_number`.
- **Read `/api/read/personalization`** (F-READ-4) re-fetches `getAyatByPage` `SELECT *` (~862
  B/row) purely to re-derive ayah ids the client **already has** (`readingAyahIds` prop) — ~**36
  KB egress discarded/call** on the densest page. Fix: send `ayahIds` in the payload.
- **Read `fetchExpandedAudioTracks`** (F-READ-5) — browser anon-key `SELECT *` on `ayat`,
  uncached, up to **~246 KB per "play whole surah/juz" expand**.
- **`import-memorized`** (H7) — up to a 6,236-int `IN(...)` list in one existence check
  (one-time action, not hot path).
- **`getTopFahamWordIds` 4,000-int `IN(...)` list** (F6) shipped into nearly every hot faham
  query — request-payload weight (overlaps RC-H: a `frequency`-rank predicate keeps the id
  list in the DB).

**Fix:** a shared `firstOccurrenceFor(wordIds)` helper for the 6 embed sites; explicit column
lists everywhere (no-`select("*")` grep-gate); lean count-only/id-only query variants for the
home + hifz plan paths; pass known ids from client instead of re-deriving.

### RC-E — Double `auth.getUser()` per request (app-wide)
**[DIMENSION: latency] [FIX: apply-now-quick-win]**
Discovered on the read surface (F-READ-1) but **global**: `middleware.ts` calls
`supabase.auth.getUser()` (GoTrue network round-trip) on every non-static request, then every
authenticated route calls `getOptionalAuthUser()` which builds a **second** client and calls
`auth.getUser()` **again** for the same request. Confirmed 6 call sites, none reuse the
middleware-verified identity. Home hits the same tax (PERF-A "also observed": middleware +
RSC). **2 sequential GoTrue round-trips per authenticated API call**, before any Postgres query.
**Fix:** middleware attaches the verified id to a request header (`x-user-id`) that handlers
read, OR migrate to `supabase.auth.getClaims()` (local JWT verify, no network) if the signing
key is asymmetric.

### RC-D — Serialized N+1 writes
**[DIMENSION: latency, connections] [FIX: quick-win Promise.all → data-layer-wave batched RPC]**
*(Deduped: the `rate-batch` loop is flagged in both PERF-C H1 and PERF-F P4#4 — one entry.)*

- **`rate-batch` (`api/hifz/rate-batch/route.ts:63-124`)** — a plain `for…of` over up to 50
  entries, each doing `getProgressById → updateFsrsFields → maybe updateHifzStatus/demote →
  logReview → recordActivityEvent`, **fully serial**: up to **~250 sequential round-trips per
  POST**; a realistic 10-item chunk ≈ 40–50. This is the **primary write path** for every
  review and memorize session, not a rare import.
- **`materializeNewFahamCards` / `getBootstrapFahamCards`** (F7 / P4#1,2) — `getOrCreateVocabProgress`
  per candidate (SELECT-then-maybe-INSERT), Promise.all'd but N pairs.
- **`mark-memorized`** (P4#3) — per-id up to 3 sequential queries, N in parallel; fires a
  *second* full snapshot recompute back-to-back with `rate-batch` in the memorize flow (H6).

**Fix:** **APPLY-NOW** wrap `rate-batch`'s `for` in `Promise.all` (entries independent → ~250
serial → ~50 parallel round-trips). **DATA-LAYER:** bulk-`select .in(ids)` + VALUES-list UPSERT /
batched FSRS-update RPC + bulk `review_log`/`activity_events` insert → ~4 total round-trips; a
shared `batchGetOrCreate` upsert-returning helper for the SELECT-then-INSERT-per-item shape;
collapse `rate-batch`+`mark-memorized` into one endpoint.

### RC-H — Unapplied index migration + missing indexes (G0 — premise-correcting)
**[DIMENSION: latency, compute, storage] [FIX: operator-deploy + apply-now]**
`list_migrations` shows the newest **applied** migration is `20260314193000_add_hifz_page_progress_view`.
**Six later migrations are absent from the live ledger, including `20260713130000_perf_indexes.sql`
— the one the faham spec calls "already shipped."** Ground truth confirms the DDL is not live:
`words` has no `idx_words_frequency` (so F6's 21,977-row seq-scan+sort still bites);
`vocab_progress.word_id`, `vocab_exposure_events.ayah_id`, `study_progress.ayah_id` FK indexes
still missing; `user_activity_log` still has both duplicate uniques. The migration file itself
is correct and additive-safe (`CREATE INDEX IF NOT EXISTS ×4`, `DROP INDEX IF EXISTS ×1`).
**7 further unindexed FKs** (`feedback.user_id`, `themes.parent_id`, `theme_chunk_progress.surah_id`,
`tafsir_notes.ayah_id`, `asbab_nuzul.ayah_id`, `hadith.kitab_id`, `hadith_kitab.source_id`) sit
on tiny/empty content tables — LOW now, add opportunistically. **16 unused indexes** are
review-only (mostly "never queried yet" on empty tables — do NOT bulk-drop).
**Fix:** apply `20260713130000_perf_indexes.sql` to prod + reconcile the migration ledger
(earlier features like `dashboard_snapshot` were applied out-of-band via SQL editor and never
recorded).

### RC-F — GET requests with write side-effects
**[DIMENSION: latency, compute] [FIX: data-layer-wave]**
`promoteSabqiToManzil` (`hifz/study-progress.ts:129-143`) is an `UPDATE study_progress …` that
runs **unconditionally, synchronously, `await`-ed before** the `Promise.all([getSabqi,
getOrCreateSabak, getManzil])` read batch — on **every cold home load** (F-HOME-2) and every
`buildDailyPlanWithDetails` (hifz H5, queue-start, import). Index-backed and cheap per call
(~0.15 ms, usually 0 rows), so this is a **correctness/architecture** finding: a GET handler
with a write side-effect, serialized ahead of the reads it blocks.
**Fix:** move sabqi→manzil promotion to a scheduled/cron job (nightly, bulk across users) so
the read paths never write; at minimum gate it with a per-user "already promoted today" check.

### RC-G — Independent awaits run sequentially (should be `Promise.all`)
**[DIMENSION: latency] [FIX: apply-now-quick-win]**
5 confirmed sites in the population sweep (PERF-F P1) + 2 more from other lanes:
- **`dashboard-preview/page.tsx:62-64`** (PERF-E 4a) — `await loadHifzSnapshot()` then `await
  loadHomeDashboardSnapshot()` sequentially; measured **FCP 360 ms vs 28–76 ms** everywhere
  else, ~**280–300 ms avoidable**.
- **`middleware.ts`** (F-READ-2) — awaits `checkRateLimit` (Upstash) then `updateSupabaseSession`
  sequentially on every `/api/*` call; independent → `Promise.all` (check the resolved
  rate-limit value before returning).
- **`activity.ts:226,259,302`** — 3 `Math.max`-only-combined pairs.
- **`api/tema/[surah]/route.ts`** — prev-surah fetch depends on nothing computed; parallelize.
- **`api/reading/state/route.ts:28-29`** — two writes to different tables, no dependency.
Each is a 1-line wrap, no schema change.

### RC-I — Dead code / phantom RPC / dead tables, views, endpoints
**[DIMENSION: latency, compute, storage] [FIX: apply-now-quick-win]**

- **Phantom RPC `get_last_review_per_page`** (H4) — referenced by `stats.ts:150` but **does not
  exist** in the DB (`pg_proc` returns 0 rows). Error silently swallowed → `lastReviewedAt`
  permanently `null` for all 604 grid pages + **1 guaranteed-failing round-trip per cold hifz
  load**. Implement it or delete the dead call + the "last reviewed" affordance. *(Note:
  migration `…200000_add_last_review_per_page_rpc` is one of the 6 unapplied — implementing =
  applying that migration; deleting = code-only.)*
- **`user_streaks`** (H8) — 2 rows, **never queried** (`grep` → 0). Dead table; streaks are
  actually derived by scanning `activity_events` + `user_activity_log`.
- **`user_activity_log`** (F-HOME-5) — **5 rows project-wide**, effectively dead legacy table,
  yet read **twice per home load** (`getLegacyActivityDateKeys` + `loadReadSnapshot`'s own
  select). Confirm migrated, drop the 2 legacy reads.
- **`v_word_rank_coverage`** — dead view (see RC-A); drop.
- **`/api/home/dashboard/route.ts`** — duplicates `loadDashboardWithDbCache`, **zero callers**.
- **`ContinueReadingCard.tsx`** — zero callers; not rendered on `/`.
- **`getWordsForAyah` (`queries.ts:117`, `"*, words(*)"`)** — dead code, zero live callers.

### RC-J — Frontend weight / asset optimization
**[DIMENSION: egress, latency] [FIX: apply-now font · frontend-phase2 splits · infra-config images]**

- **APPLY-NOW: `UthmanicHafs_V22.ttf` shipped as raw TTF, not woff2** (`layout.tsx:6-8`). Loaded
  on every Arabic-text route (`/faham`, `/read/*`, `/read/surah/*/themes`). Measured re-encode
  (fontTools): **297,700 B TTF → 107,056 B woff2 (64% on-disk)** → transfer **143.9 KB → ~104
  KB, ~39 KB (27%) saved/load**, zero refactor (re-encode + one path string).
- **INFRA: `mushaf-pages` bucket = 531 MB / 1,812 objects (~300 KB/page avg)** — the dominant
  storage+egress asset. Within Pro quotas today (no overage), but the biggest future egress
  lever: WebP/AVIF + right-sizing (not 2× retina everywhere) + immutable long `Cache-Control`
  behind Smart CDN. (`MUSHAF_CDN_ENABLED=false` today.)
- **FRONTEND-PHASE2: `FahamWorkspace.tsx` (1,879 LOC) and `HifzMemorizeStepper.tsx` (1,047 LOC)
  have zero internal `dynamic()` splits** (F11 / PERF-E §3), unlike `ReadPageWorkspace`'s good
  9-way `ssr:false` pattern. Split session-summary + offline-sync-banner (~27 KB transfer/88 KB
  decoded on `/faham`) behind `dynamic()`.
- **FRONTEND: `/read/surah/[surah]/themes`** client-fetches its primary content
  (`/api/tema/[surah]`) post-hydration instead of server-rendering it alongside the already
  server-fetched `surahMeta`/`allSurahs` — 1 guaranteed extra RTT (364 ms cold / 3 ms warm).
  Pass as `initialData`.

### RC-K — RLS initplan per-row re-eval (future, gated)
**[DIMENSION: compute] [FIX: data-layer-wave, gated on Phase-2 RLS activation]**
25 `auth_rls_initplan` WARN across 11 user tables. Each policy calls `auth.uid()` /
`current_setting()` **per row** (planner treats VOLATILE). **Currently INERT** — the hot path
uses the service-role key (RLS bypass). Becomes a per-row function-call storm the moment
client-direct RLS-enforced queries go live. **Fix in the same wave that activates RLS:** wrap
`auth.uid()` → `(select auth.uid())` (evaluates once as an InitPlan). Harmless now, mandatory
then.

---

## 4. Three action buckets

### 4.1 APPLY NOW — restructure-independent quick-wins the Tower can dispatch immediately

| # | Fix | One-line change | Safety |
|---|---|---|---|
| 1 | **Apply `20260713130000_perf_indexes.sql` to prod** (G0) | `words(frequency DESC)` + 3 FK indexes + drop duplicate `user_activity_log` index; reconcile ledger | **needs-a-migration** (operator/apply) |
| 2 | **Drop dead view `v_word_rank_coverage`** | `DROP VIEW v_word_rank_coverage` (zero `src/` refs) | **needs-a-migration** |
| 3 | **`rate-batch` `for` → `Promise.all`** | wrap the per-entry work (entries independent) → ~250 serial → ~50 parallel round-trips | **pure-safe** (code only) |
| 4 | **Font TTF → woff2** | re-encode `UthmanicHafs_V22.ttf`, update path in `layout.tsx` → −39 KB/load | **pure-safe** |
| 5 | **`dashboard-preview` sequential await → `Promise.all`** | `page.tsx:62-64` → ~280–300 ms TTFB | **pure-safe** |
| 6 | **Phantom-RPC cleanup** (H4) | delete the dead `get_last_review_per_page` call + `lastReviewedAt` affordance (or apply the RPC migration) | **pure-safe** if deleting; needs-a-migration if implementing |
| 7 | **Dead-table read cleanup** | drop the 2 `user_activity_log` legacy reads from the home hot path; note `user_streaks` unused | **pure-safe** (dropping *reads*); dropping the tables = needs-a-migration |
| 8 | **Snapshot-cache write-back** (F-HOME-1) | `after(() => writeSnapshot(userId, snapshot))` in the miss branch, reusing the computed object (small) → repeat home loads 45→3 round-trips | **pure-safe** |
| 9 | **RC-E: single `auth.getUser()`** | middleware sets `x-user-id`; handlers read it instead of re-verifying (or `getClaims()`) | **pure-safe** (code only) |
| 10 | **RC-G Promise.all sites** | `middleware` rate-limit+session; `activity.ts` ×3; tema route; reading/state route | **pure-safe** |
| 11 | **`/api/read/personalization` payload** (F-READ-4) | send known `ayahIds` from client instead of re-fetching `ayat SELECT *` | **pure-safe** |
| 12 | **Dead-code deletes** | `/api/home/dashboard/route.ts`, `ContinueReadingCard.tsx`, `getWordsForAyah` | **pure-safe** |

**Pure-safe (code-only, no DB change):** 3, 4, 5, 8, 9, 10, 11, 12 (+ 6/7 when deleting code
rather than DB objects). **Need-a-migration (DB DDL):** 1, 2, 6 (if implementing the RPC), 7
(if dropping the tables).

### 4.2 DATA-LAYER-WAVE spec — the perf contract the Phase-1 `data/` repository build enforces

1. **Memoization convention + grep-gate (RC-B/P6):** every exported pure-read repository
   function wrapped in `unstable_cache` (explicit tag + short TTL) by convention; a grep-gate
   (same posture as the shadow-screen merge gate) flags any new `src/lib/**` file that calls
   `supabaseServer.from(...).select(...)` without appearing in the cached-files list.
2. **Materialized rollups (RC-A):** (a) per-`(user,word)` **exposure-summary rollup table**
   updated on exposure-write (or matview refreshed in the existing `after()` hook) — collapses
   F2 + candidates + stats-count; (b) hifz **`page_meta` materialized** as a 604-row static
   lookup; (c) DB-side distinct-count (view/RPC) for tema `exploredCount`.
3. **No-`select("*")` gate (RC-C/P2):** lint/grep rule banning bare `.select()` / `.select("*")`
   in `src/lib/**` (excluding `{ head: true }` count queries) → forces explicit column lists.
4. **`firstOccurrenceFor(wordIds)` helper (RC-C/P3/F4):** one shared helper the 6 `repository.ts`
   card-fetchers call instead of each repeating the `word_occurrences(…ayat(…))` embed →
   collapses 6 near-identical 500 ms-class queries to one fixed shape (small keyed query /
   `.limit(1)` embedded relation).
5. **`batchGetOrCreate` upsert-returning helper (RC-D/P4/F7):** for the
   read-then-maybe-insert-per-item shape; plus a batched FSRS-update RPC so `rate-batch`
   collapses to ~4 round-trips.
6. **GET-side-effect removal (RC-F):** `promoteSabqiToManzil` moved to a scheduled job, decoupled
   from every read path.
7. **Lean count-only / id-only query variants (RC-C):** `getDailyPlanPageNumbers()` (no text, no
   `surahs` join) for count-only call sites; home `enrichWithAyahDetails` split into a
   `page_number`-only query + a 1-row head-detail lookup.
8. **`words.frequency` predicate over IN-lists (F6):** replace the 4,000-int `IN(topN)` with a
   `frequency`-rank predicate/join so the id list never leaves the DB (depends on the index
   from bucket 4.1 #1).

### 4.3 DEPLOY / INFRA / OPERATOR — needs operator action

- **Apply the 6 unrecorded migrations to prod** and reconcile the migration ledger (headline:
  `20260713130000_perf_indexes.sql`; see 4.1 #1). Rollback: all four `CREATE INDEX` are
  `IF NOT EXISTS`, the `DROP INDEX` is `IF EXISTS` — additive/safe, revert by `DROP INDEX` the
  four new ones.
- **`mushaf-pages` image bucket (531 MB / 1,812 objects):** WebP/AVIF transform + right-sizing +
  immutable long `Cache-Control` behind Smart CDN; confirm no duplicate page re-uploads across
  manifest revisions.
- **RLS-initplan fix (RC-K, 25 WARN):** bundle into the Phase-2 RLS-activation wave — wrap
  `auth.uid()` → `(select auth.uid())` in the policies **at the same time** RLS goes live, not
  before.
- **`auth_db_connections_absolute` (10-connection Auth cap):** switch to percentage-based
  allocation only when scaling the compute instance up (irrelevant at current size).

---

## 5. Corrections the sweep made to earlier assumptions

1. **The `/api/read/personalization` ~1800 ms is NOT a slow DB query** — it is a hardcoded
   `requestIdleCallback({ timeout: 1800 })` frontend idle-timer (`ReadPageWorkspace.tsx:672-712`).
   The queries behind it are **sub-millisecond** (EXPLAIN-confirmed on the densest 42-ayat page).
   Fix is a frontend timing change, 0% data-layer. *(PERF-B §2)*
2. **The "~1.99 MB client JS" is the whole-app on-disk total across all routes, not a per-route
   load.** Measured per-route transfer tops out at ~589 KB (`/read/1`). The "largest chunk 420
   KB" is the **VAD/Tasmi voice bundle** (`MicVAD` + `onnxruntime-web`), **already correctly
   deferred** behind `ssr:false` — it loaded on **none** of the 7 routes swept. Not first-load
   bloat. *(PERF-E §1–2, F11 reframed)*
3. **The pooler / connection-exhaustion axis is a non-issue.** Miftah opens **no raw Postgres
   connections** — it talks exclusively to the Supabase Data API (PostgREST over HTTPS 443); no
   `pg`/`postgres`/`drizzle`/`prisma`, no `:5432`/`:6543`/pooler string anywhere. The serverless
   "direct connection → pool exhaustion" failure mode **structurally cannot happen**. The
   ~46-round-trip fan-out is a latency + PostgREST-CPU cost, not a connection storm. *(PERF-D §1)*
4. **The "already-shipped" index migration is NOT live** (G0) — the newest *applied* migration
   is `20260314193000`; `20260713130000_perf_indexes.sql` (and 5 others) are absent from prod.
   Five fixes believed done (F6/F9) are still live-unfixed. The whole ledger's "indexes already
   fixed, find everything else" premise rests on this — correct it first. *(PERF-D G0)*
5. **The home `dashboard_snapshot` 5-min cache is a paper tiger** — 0/71 profiles have a fresh
   snapshot (never written back on the cold path), so the cold ~45-round-trip path is what
   *every* home load takes, not the rare fallback it was designed as. *(PERF-A F-HOME-1)*
6. **Minor corrections (PERF-A):** `ActivityHeatmap.tsx` doesn't exist (closest `JuzHeatmap.tsx`,
   wired to `/hifz` not home); `ContinueReadingCard.tsx` has zero callers; `getReadJumpTargets`
   is a verified non-issue (local seed JSON, no Supabase in the normal path).

---

## 6. Biggest 3 wins overall

**#1 — Maintain a rollup for `v_vocab_exposure_summary` + activate the `words(frequency)` index
(RC-A + RC-H, faham F2/F3/F6 as one Phase-1 lane).** This is the single structural move with the
largest measured wall-clock reduction on the operator's *exact* complaint ("faham took long to
load due to data calling"): it collapses the three most expensive query families at once —
`countFoundWords` 227 ms×4 → ~1 ms, `getFahamExposureCandidates` 101 ms, `getFahamStats` count
88 ms — **and** removes the 4,000-integer `IN(…)` round-trips. Because `getFahamLevelState` runs
that found-count 4× and is itself computed 2–4× per load, the leverage multiplies; and its home
twin (F8) means the same fix also lightens the home cold path. **Prerequisite:** apply the
index migration (G0) — the cheapest possible unblock.

**#2 — Request-level memoization convention + the home snapshot write-back (RC-B).** The systemic
root: 18/22 lib files uncached, `getFahamLevelState` recomputed 2–4×, and a home snapshot cache
that fires 0% of the time. The APPLY-NOW write-back alone turns repeat home loads from ~45
round-trips to 3; the `unstable_cache` convention + grep-gate prevents the whole class (F1, F5,
F8, PERF-F P5) going forward.

**#3 — Collapse the `rate-batch` N+1 write chain (RC-D).** The hot write path for every review
and memorize session runs up to ~250 sequential round-trips today; the APPLY-NOW `Promise.all`
(~250→~50) then the batched-RPC data-layer fix (~50→~4) is the biggest tail-latency removal on
the write side and scales linearly with session size.

---

## 7. What the repository layer must enforce (one paragraph for Wave-5 faham + data-layer waves)

The Phase-1 `data/` repository is the enforcement point for six perf invariants, and the faham
(Wave-5) rebuild must be built *to* this contract, not retrofitted after: **(1)** every
pure-read export is `unstable_cache`-wrapped (explicit tag + short TTL) and a grep-gate rejects
any new `src/lib/**` file that selects from Supabase without being in the cached-files list —
this is the single highest-leverage rule because it is the root cause behind the faham
double-recompute, the per-page-turn recompute, and the repeated level-state/exposure-summary
computations; **(2)** no expensive aggregate is computed from a plain view on a hot path — the
`(user,word)` exposure summary and the static hifz `page_meta` are maintained rollups, and
distinct-counts are computed DB-side, never by shipping rows to dedupe in JS; **(3)** no
`select("*")` in `src/lib/**` (grep-gated, `{head:true}` excepted) — every function names its
columns, and count-only/id-only callers get lean query variants that never fetch `text_uthmani`/
`display_bm`; **(4)** the `word_occurrences` first-occurrence embed is one shared
`firstOccurrenceFor()` helper, not six copies; **(5)** per-item read-then-write loops go through
a `batchGetOrCreate` upsert-returning helper and bulk inserts, never a serial `for`-loop of
round-trips; **(6)** read paths never write — GET-triggered mutations like `promoteSabqiToManzil`
move to scheduled jobs. Enforced together, these turn faham's ~46-round-trip / double-recompute
load and home's ~45-round-trip cold path into cached, rollup-backed, single-pass reads, and make
every future repository function conform by construction rather than by audit.

---

## 8. Measurement caveats (carried from the source lanes)

- **No authenticated session** on any lane — `/api/faham/*`, `/api/hifz/*`, `/api/reading/state`
  401 without login. Round-trip *counts* and per-query `EXPLAIN` ms are exact (read from
  source); *aggregate wall time* (faham queue est. ~1–2 s, stats ~0.4–0.8 s) is a modeled sum,
  not a stopwatch reading. GoTrue round-trip wall time (RC-E) is a code-structure fact, not
  clocked.
- **EXPLAINs ran warm** (`shared hit` dominant) — a genuinely cold production buffer cache (first
  request of the day) lands nearer the cold figures (e.g. hifz view 232 ms, not 8 ms).
- **Connection-pool contention** from stacking `after()` recomputes / the `rate-batch` fan-out
  under real concurrent traffic is inferred from the 10-connection Auth cap, not load-tested.
  (PostgREST bounds concurrency at its own server-side pool, not Vercel invocation count.)
- **Frontend numbers** measured on localhost via Playwright `networkidle` (mobile 390×844 +
  desktop 1440×900), not a throttled 3G/4G profile or real hardware; interactive-mode chunk
  loading (entering hifz/tasmi) not timed.
- **Single-project data** — freshness/row-count facts (0/71 fresh snapshots, 5-row
  `user_activity_log`) are strong architectural signals from this project's dataset, not a live
  production traffic trace.
</content>
