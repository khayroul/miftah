# Load-Time / Performance Audit — Miftah (2026-07-13)

**Instruction origin:** operator load-time question — *"faham took long to load due to data calling."*
**Consumed by:** Phase-1 `data/` repository wave + operator. Fact-Forcing Gate facts (no prior perf-audit doc; no data-file writes beyond this report).
**Method:** static read of the faham data path + `EXPLAIN (ANALYZE, BUFFERS)` on the hot queries against project `axjuolsguunsvqhmeveq` (read-only MCP) + a production `npm run build` and `next start` TTFB sweep of the logged-out paths.
**Auth model fact:** `src/lib/supabase-server.ts` uses the **service_role key → RLS is bypassed** on every server/API faham query. The `EXPLAIN` plans below (run as `postgres`) are therefore representative of production. The 27 `auth_rls_initplan` advisor WARNs do **not** touch the faham hot path.

**Tags:** `DATA-LAYER` = folds into the Phase-1 `data/` repository build · `FRONTEND` = Phase-2 redesign · `QUICK-WIN` = small, restructure-independent, do-now.

**Already-landed fixes verified present (not re-reported):** `859de0d` (defer faham stats to client + skeleton), `bf724c7` (scope ReadAudioProvider + defer home UI), `4c04607` (cache manifest API), `bafce40` (warm next-page font only), `1441528` (disable dashboard/mode-nav prefetch). Everything below is **still slow beyond** those.

---

## 1. Faham per-load round-trip count + the slow calls (with EXPLAIN evidence)

### Table row counts (context)
`words` 21,977 · `word_occurrences` 77,429 · `vocab_progress` 669 · `vocab_exposure_events` 37,638 · `review_log` 1,041 · `ayat` 6,236. Hot test user `5c2c…c921` has **24,553** exposure rows.

### An authenticated `/faham` load fires **~46 Supabase round-trips across two API calls** (plus RSC auth):

`src/app/faham/page.tsx` renders the empty default queue and sets `shouldHydrateInitialQueue = true`; the client (`FahamWorkspace`) then fires **both** endpoints on mount:

**A. `POST /api/faham/queue` → `buildFahamQueueSnapshot` — ~30 round-trips:**
| Step | Queries | Note |
|---|---|---|
| `getFahamLevelState` | **12** | 4× `getTopFahamWordIds` (limits 1000/2000/3000/4000) + 4× `countFoundWords` + 4× `countMasteredWords` |
| `getDueFahamCards` | 1 | **517 ms** nested-relation join (see below) |
| `getFahamExposureCandidates` | 3 | view select **101 ms** + `words IN(…)` + `vocab_progress IN(…)` |
| `getMasteredFahamCards` / `getLearningFahamCards` | 2 | same join shape as due |
| `materializeNewFahamCards` | up to **10** | **N+1** — `getOrCreateVocabProgress` per new candidate |
| `getFahamMcqWordPool(1200)` | 1 | `words IN(4000)` + `word_occurrences` fan-out, limit 1200 |
| `getRecentFahamExposureSources` | 1 | — |

**B. `GET /api/faham/stats` — ~16 round-trips:** `getFahamLevelState` **again (12, fully redundant with A)** + `getFahamStats` (view count **88 ms** + `vocab_progress` select + `review_log` select).

So **`getFahamLevelState` (12 queries, incl. four 227 ms seq-scans) is computed twice per load**, and `/stats` re-fires on every card advance (§ finding F5).

### The four slow calls — measured `EXPLAIN (ANALYZE, BUFFERS)`:

**(a) `countFoundWords` (`src/lib/faham/levels.ts:143`) — 227 ms, ×4 per level-state build.** Filtering on the view's *computed* `reading_event_count > 0` defeats any index → **Seq Scan on `vocab_exposure_events` (37,638 rows)** + HashAggregate:
```
Aggregate (actual time=227.383..227.387)
  -> Hash Semi Join (rows=1332)
     -> HashAggregate (Group Key: vee.word_id)  Filter: count(*) FILTER (reading_page) > 0
        -> Seq Scan on vocab_exposure_events  (rows=24553)  Rows Removed by Filter: 13085
Execution Time: 227.700 ms
```

**(b) `getDueFahamCards` (`repository.ts:275`) — 517 ms.** The embedded `word_occurrences(…, ayat(…))` relation pulls **every** occurrence of each due word (560 occurrence rows for just **9** due words) then Nested-Loops `ayat` 560×; the code only ever uses `firstRelation` (the first occurrence):
```
Limit (actual time=517.280..517.305 rows=120)
  -> Nested Loop Left Join (rows=560)          <- word_occurrences fan-out
     -> Nested Loop Left Join (rows=560)        <- ayat joined 560 loops
Execution Time: 517.576 ms
```
Same over-fetch shape in `getMasteredFahamCards`, `getLearningFahamCards`, `getBootstrapFahamCards`, `getFahamMcqWordPool`, and the `words` select inside `getFahamExposureCandidates`.

**(c) `getFahamExposureCandidates` (`repository.ts:337`) — 101 ms**, reading ~37,270 buffers (essentially the whole table) to GroupAggregate the view over 24,553 rows, per queue build.

**(d) `getFahamStats` encountered-count (`repository.ts:607`) — 88 ms**, GroupAggregate over the same 24,553 rows.

**(e) `getTopFahamWordIds` (`repository.ts:76`) — 10.7 ms *each*, no index:**
```
Limit -> Sort (Sort Key: frequency DESC, top-N heapsort)
  -> Seq Scan on words (rows=21977)
Execution Time: 10.740 ms
```
Called 5–8× per load; its output is then shipped back as a **4,000-integer `IN (…)` list** appended to nearly every hot query.

### The W-L B10 "double `/api/faham/stats`" — CONFIRMED + quantified
`FahamWorkspace.tsx`: the effect at **line 1109** re-runs `refreshStats(true)` whenever `sessionDoneCount` changes, and `moveToNextCard` bumps `sessionDoneCount` on **every** advance (line 901) → **one full `/stats` recompute per card advance.** On the terminal card the same function *also* calls `refreshStats(false)` directly (line 919) while line 917 bumps `sessionDoneCount` → the effect fires too → **two near-simultaneous `/stats` recomputes at each session boundary.** Each recompute is the ~16-round-trip / ~400–800 ms path in §1-B.

---

## 2. Ranked findings

| # | Finding (file) | Measured cost | Tag | Fix |
|---|---|---|---|---|
| **F1** | `getFahamLevelState` computed **twice per load** (inside `/queue` and `/stats`) and again on every advance; not memoized across the two endpoints. | 12 queries ×2 = **24 queries/load**, incl. 8× 227 ms seq-scans | **DATA-LAYER** (+QUICK-WIN memo) | Single-pass 4-tier compute; `React.cache`/request-memo shared by queue+stats; stop recomputing per advance. |
| **F2** | `countFoundWords` filters the view's computed `reading_event_count` → **seq scan of 37,638 rows**, ×4 per build (`levels.ts:143`). | **227 ms × 4** | **DATA-LAYER** | Count directly on `vocab_exposure_events WHERE source_type='reading_page'` (index-backed), one grouped query for all 4 tiers. |
| **F3** | `v_vocab_exposure_summary` is a plain view re-aggregating all 37,638 rows on **every** call (candidates, stats-count, found-count). | 88–227 ms each | **DATA-LAYER** | Maintain a per-`(user,word)` summary **rollup table** on exposure-write (or MATERIALIZED VIEW refreshed in the existing `after()` hook). Collapses F2 + candidates + stats-count at once. |
| **F4** | `word_occurrences(…ayat…)` embedded relation over-fetches **all** occurrences/word; only the first is used (`getDue/Mastered/Learning/Bootstrap/McqPool/Candidates`). | **517 ms** (due) | **DATA-LAYER** | Limit the embedded relation to 1 row (min position), or fetch first-occurrence in a separate small keyed query. |
| **F5** | `/api/faham/stats` re-fetched on **every** card advance (`FahamWorkspace.tsx:1109` ← `sessionDoneCount`) and **doubled** at session end (direct call L919 + effect). | ~16 round-trips/advance; ×2 at session end | **FRONTEND** (+QUICK-WIN dedupe) | Drop the direct L919 call (let the effect own it); only refresh stats at session end, not per card; or derive found/mastered deltas client-side. |
| **F6** | `words.frequency` has **no index**; every `getTopFahamWordIds` seq-scans+sorts 21,977 rows, then ships a **4,000-int `IN(…)`** list into each hot query. | 10.7 ms × ~6/load + wire weight | **DATA-LAYER** | `CREATE INDEX ON words (frequency DESC)` → index-only scan; better, replace `IN(topN)` with a `frequency`-rank predicate / join so the 4,000-id list never leaves the DB. |
| **F7** | `materializeNewFahamCards` N+1 — `getOrCreateVocabProgress` per candidate (`repository.ts:405`). | up to 10 SELECT/INSERT/build | **DATA-LAYER** | Batch `upsert … on conflict (user_id,word_id) do nothing … returning *` in one round-trip. |
| **F8** | Home dashboard cold path duplicates the same `getFahamLevelState` + view aggregation (`homeDashboard.ts:164`). | same 227 ms family | **DATA-LAYER** | Shares the F1/F2/F3 fix. (Already mitigated on warm loads by the 5-min `profiles.dashboard_snapshot` cache.) |
| **F9** | Unindexed FKs: `vocab_progress.word_id`, `vocab_exposure_events.ayah_id`, `study_progress.ayah_id`; duplicate index on `user_activity_log`. | advisor INFO/WARN | **QUICK-WIN** | Add covering indexes; drop one duplicate `user_activity_log` index. |
| **F10** | `auth_rls_initplan` on 12 user tables re-evaluates `auth.<fn>()` per row. **Not** on the faham hot path (service-role bypass) — bites only future direct-from-client queries. | advisor WARN ×27 | **QUICK-WIN** | Wrap as `(select auth.uid())` in the policies. |
| **F11** | Client weight: `FahamWorkspace.tsx` is 71 KB / 1,879 lines (one client component); total client JS ≈ 1.99 MB uncompressed, largest chunk 420 KB. No single egregious route bundle. | build measure | **FRONTEND** | Phase-2: split FahamWorkspace (queue-fetch, audio, MCQ, session-summary); not the operator's named pain. |

**Measured logged-out server TTFB (warm, `next start -p 3203`):** `/` 5.9 ms · `/faham` 5.3 ms · `/hifz` 7.0 ms · `/read/1` 4.6 ms · `/read/surah/1/themes` 3.7 ms. **Server render is not the bottleneck** — the faham cost is entirely the *authenticated client-side API waterfall* (queue POST + stats GET), which returns 401 with no session (so it can't be wall-clocked here, but is fully characterized by the EXPLAIN evidence above). `/hifz` ships the largest logged-out HTML payload (89 KB) — minor.

---

## 3. The single biggest win

**Collapse the `v_vocab_exposure_summary` re-aggregation into a maintained per-user rollup, and index `words.frequency`** (F2 + F3 + F6 together, one Phase-1 lane). One structural move simultaneously kills the three most expensive query families — `countFoundWords` 227 ms → ~1 ms, `getFahamExposureCandidates` 101 ms, `getFahamStats` count 88 ms — **and** removes the 4,000-integer `IN(…)` round-trips. Because `getFahamLevelState` runs that found-count 4× and is itself computed twice per load plus once per advance, this is the highest wall-clock leverage on the operator's exact complaint. **Runner-up:** F4 (the 517 ms `word_occurrences` fan-out) — the biggest *single query*, fixed independently by limiting the embedded relation to the first occurrence.

---

## 4. Index / view gaps found

- **Missing:** `words (frequency DESC)` — forces a 21,977-row seq-scan+sort on every `getTopFahamWordIds`. **(add)**
- **Anti-pattern view:** `v_vocab_exposure_summary` — plain (non-materialized) `GROUP BY user_id, word_id` over all 37,638 exposure rows, re-computed every call; filtering its computed columns (`reading_event_count`) forces full seq scans. **(materialize / rollup table)**
- **Unindexed FKs (advisor):** `vocab_progress.word_id`, `vocab_exposure_events.ayah_id`, `study_progress.ayah_id`, plus `asbab_nuzul`, `feedback`, `hadith*`, `tafsir_notes`, `theme_chunk_progress.surah_id`, `themes.parent_id`.
- **Duplicate index:** `user_activity_log` has two identical `(user_id, activity_date, activity_type)` uniques — drop one.
- **Present & healthy (no change):** `vocab_progress` is well-covered — `(user_id,due)`, `(user_id,is_mastered)`, `(user_id, needs_reinforcement DESC, due)`, `unique(user_id,word_id)`; `vocab_exposure_events` has `(user_id,word_id,exposed_at)`, `(user_id,source_type,exposed_at)`, `(word_id,source_key)`. The faham slowness is **query shape, not missing progress-table indexes.**

---

## 5. What I could NOT measure

- **No authenticated session.** `/api/faham/queue` and `/api/faham/stats` 401 without a logged-in user, so their end-to-end wall time (network + connection contention) is inferred from per-query `EXPLAIN`, not clocked live. The ~46-round-trip count and per-query ms are exact; the *aggregate* wall time (est. queue ~1–2 s, stats ~0.4–0.8 s) is a modeled sum, not a stopwatch reading.
- **Connection-pool contention** under the real Supabase pooler (Auth capped at 10 connections per advisor) is not modeled — the `Promise.all` fan-outs may serialize under load, making real wall time *worse* than the parallel-ideal estimate.
- **Cold-cache / first-request** DB times (my EXPLAINs ran warm, `shared hit` almost entirely) — a genuinely cold buffer cache would be slower.
- **Real device/network** client waterfall (hydration → queue POST → stats GET ordering on a phone) — measured only server-side TTFB on localhost.
- Bundle numbers are **uncompressed** chunk sizes on disk, not gzip/brotli transfer sizes.
