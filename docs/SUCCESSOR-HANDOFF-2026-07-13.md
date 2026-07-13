# Miftah — Successor Handoff (for GPT-5.6, 2026-07-13)

You are the successor engineer/orchestrator continuing the Miftah rebuild. This file is self-contained — read it fully, then verify live state with `git log`/`git status` before acting. Repo: `/Users/Executor/miftah` (this repo is THE canonical product).

---

## 0. IDENTITY & NORTH-STAR (read this first — it drives every decision)
- **Miftah (مفتاح) = "the KEY to understanding the Quran."** Not a memorization app — the app that measurably unlocks Quran comprehension.
- **Central metric = Understanding Coverage %** = Σ(frequency of a user's mastered words) / Σ(frequency of all Quran words). Measured live: top 500 words = 51.9% of the Quran; the operator's own account = 26% understood with 207 words. The frequency-weighting turns "1% of words" into "26% of the Quran" — that reframing is the product.
- **Ratified curriculum direction (operator):** a guided default "Understanding Path" powered by a **"next best words" recommender** (scores un-mastered words by leverage=frequency + learnability + reading-context + FSRS-readiness), with a "fastest route" toggle. Package the top ~50 particles as a framed "grammar keys" unit; teach top CONTENT words first. Full spec: `docs/superpowers/specs/2026-07-13-coverage-metric-and-product-improvements.md`.
- ⚠ **Data-quality gate before coverage goes public:** frequencies sum to 96,219 but canonical Quran ≈ 77,430 tokens — verify the `words.frequency` source (word-forms vs lemmas vs over-count) and confirm the `is_mastered` bar is meaningful, BEFORE "understand X%" becomes a marquee claim. (The understanding-engine lane, in-flight, is checking this.)

## 1. THE PROGRAM (phases)
Program of record: `docs/superpowers/specs/2026-07-13-consolidation-rebuild-launch-design.md` (v1.2). Target architecture (RATIFIED): `docs/superpowers/specs/2026-07-13-target-architecture-DRAFT.md`.
- **Phase 0 — DONE:** consolidate (one repo, branches triaged to zero, satellites archived, Genesys `miftah-lab` demoted), audit → 6 root-fixes, baseline captured + re-validated byte-identical, `v1-base` tag.
- **Phase 1 — UNDERWAY (behavior-preserving restructure, 8 waves):** flat `app/components/lib` → `features/*` modules + `data/` repository layer (only Supabase toucher) + `ui/` design-system layer + `src/mushaf/` frozen kernel + ESLint boundary rule. **Wave 0 (scaffold+boundary rule+seams) DONE. Wave 1 (mushaf sacred fence, move-only, zero pixel-diff) DONE.** Next = **Wave 2 (tema)** → 3 tasmi → 4 home → 5 faham → 6 hifz → 7 read (integration hub, last) → 8 shared/pwa+repository finalize. Per-wave gate: tests green + zero pixel-diff vs `docs/baseline/2026-07-13/` + deployable.
- **Phase 2 — redesign + features:** visual redesign ORGANIZED AROUND the understanding engine (coverage% home hero, comprehension/"key" map centerpiece, grammar-keys onboarding). Feature lanes: Auth activation (Lane A), License+FPX (Lane B), Tasmi (Lane C), UX (Lane D). The coverage recommender is built in the faham wave (Wave 5).
- **Phase 3 — QA + launch/relaunch** (coverage-driven win-back for the dormant beta cohort).

## 2. IN-FLIGHT LANES (verify + merge these first — they were running at handoff)
Board discipline: re-verify each lane's gate YOURSELF, then merge with `git merge --no-ff` from `/Users/Executor/miftah`, run build+tests, then `git worktree remove` + `git branch -d`.
- **`perf/double-auth`** (worktree `~/miftah-worktrees/AUTH`, opus): eliminates the redundant per-request `auth.getUser()` (middleware + route both call GoTrue). HAD A HARD GUARDRAIL: "if the safe fix isn't provably safe, STOP and defer to Phase-2 Lane A." Also handles the middleware rate-limit/token-rotation-on-429 hazard. **CHECK: did it commit a fix, or stop-and-defer?** If it committed, verify the anti-spoof strip (Option A) or local-verify (Option B) is safe before merging — this is AUTH, a wrong merge = auth bypass. If it stopped, leave middleware alone; the fix goes to Lane A.
- **`feat/understanding-engine`** (worktree `~/miftah-worktrees/UND`, opus): builds the cached coverage%+tier ENGINE (no UI) + the data-quality verification (§0 caveat). Verify tests green + the data-quality verdict, then merge. This is the north-star's backend foundation.
- Housekeeping: two prunable detached worktrees under `/private/tmp/miftah-*` (leftover analysis) — `git worktree prune` them.

## 3. IMMEDIATE NEXT (after merging in-flight)
1. **Continue the restructure: Wave 2 (tema).** Follow the architecture draft §3 move-map. Move-only where possible; per-wave zero-pixel-diff gate.
2. **Build the coverage recommender** (the DRIVE mechanism) — natural home is the faham wave (Wave 5), but can prototype once the engine lands. Spec: coverage doc §"next best words recommender".
3. Perf: deeper data-layer fixes (materialize the exposure rollup, memoization convention, no-select(*) gate) are the **Performance & Cost Ledger** (`docs/superpowers/specs/2026-07-13-performance-cost-ledger.md`) — built INTO the repository layer during the relevant waves, NOT patched onto old code.

## 4. OPERATOR DECISIONS (ratified — do not relitigate)
Original repo canonical; one-time FPX licenses (Bayarcash/Curlec); Supabase Auth (NOT Clerk); Tasmi IN v1; restructure + full redesign pre-launch; Telegram bot RETIRED for v1 (fail-closed + out of build, parked at `src/bot/`); architecture 4 answers (auth seam now, `src/mushaf/` top-level, bot stays put, sacred fence Wave-1-early); backup WAIVED (beta data disposable); Understanding Coverage = central metric; guided-path curriculum.

## 5. OPERATOR GATES (need the operator — cannot self-clear)
- **Deploy go** — a push to `origin main` = Vercel PRODUCTION deploy to ~71 users AND runs the pending migrations including the DESTRUCTIVE tema `TRUNCATE` (`20260713120000`). Hold until explicit "deploy".
- **GitHub push** (15 local commits + 11 remote stale-branch deletions + `v1-base` tag) — operator-gated.
- **Bayarcash merchant onboarding** + **VPS credential rotation** — week-1 lead-time items for Lane B (license) + Lane C (tasmi); still NOT started.
- **Frequency-data verification** sign-off before coverage% goes marquee.

## 6. KEY FACTS
- Supabase project `axjuolsguunsvqhmeveq` ("Miftah"). **71 real auth.users but a DORMANT beta cohort** (86% signed up week 1, 0 signups since April, 39/42 engaged accounts 90+ days idle). Data operator-declared disposable → low migration risk; also the reason relaunch = a win-back, not a cold launch.
- **Migrations: APPLIED-TO-PROD already** (out of band, operator-authorized, idempotent) = the perf indexes (`words(frequency)` + FK indexes, duplicate dropped) + drop of dead view `v_word_rank_coverage`. **NOT applied (waits for deploy)** = `20260713120000` tema re-key (has the destructive TRUNCATE) + exposure `event_id`. Migration files are idempotent so re-running at deploy is safe.
- Perf: server render is FAST (3-7ms TTFB); the cost was the DB round-trip waterfall (faham ~46/load, home ~45/load). Root causes = missing request-caching, re-aggregating non-materialized views, over-fetch, N+1 writes, double-auth. Connection pooler is a NON-issue (HTTP Data API). See the ledger.
- Tasmi (v1 scope): vision `docs/superpowers/specs/2026-07-13-tasmi-mode-design-operator-vision.md` (Mode A recite-follow + 3-word talqin; Mode B juzuk exam with per-session exam/practice toggle; word-seq-only v1; phrase-level fallback). Engine ladder + spike verdict: `.../2026-07-13-tasmi-engine-upgrade-ladder.md` — **Rung 1 (Quran-tuned `tarteel-*-ar-quran` model swap) clears word-sequence on CPU, 3.45% WER @0.46s, no GPU**; word-level real-time NOT achievable on CPU → ship phrase-level v1; word-level = v1.5 via forced alignment (Rung 2); matcher must be FUZZY (Levenshtein ≤2). Lane C opens with a feasibility spike on real-device/real-reciter audio.
- Audit findings not-yet-fixed live in `docs/superpowers/specs/2026-07-13-audit-report-and-triage.md` (hifz-corruption bugs deferred to the hifz wave; all tasmi bugs → Lane C; PWA/SW → Phase-2 SW-migration lane).

## 7. HOW TO OPERATE (board loop + traps — learned the hard way this session)
- **Board loop per lane:** dispatch a worker (own git worktree off `~/miftah` main) → it does TDD/verifies → Tower re-verifies the gate ITSELF (run the tests, look at real renders, byte-check sacred files) → `git merge --no-ff` from `~/miftah` → build+tests green → `git worktree remove` + `git branch -d`. One MUTATING lane per file-domain at a time; read-only lanes parallelize freely; disjoint file domains can parallelize via separate worktrees.
- **TRAP — worktree isolation gives the WRONG repo:** spawning a worker with worktree isolation from a Genesys-rooted session creates a *Genesys* worktree. Workers must detect this (`ls /Users/Executor/miftah/src/lib/faham`) and make their OWN miftah worktree: `cd /Users/Executor/miftah && git worktree add /Users/Executor/miftah-worktrees/<X> -b <branch> main` + hardlink-copy node_modules (`cp -al`) + copy the gitignored `.env.local`. A fresh GPT-5.6 session rooted IN `~/miftah` avoids this.
- **TRAP — `EXPLAIN ANALYZE` on a write EXECUTES the write.** Two lanes accidentally mutated prod this way (one corrected). Rule: `EXPLAIN ANALYZE` only on pure SELECTs; plain `EXPLAIN` for INSERT/UPDATE/DELETE/upsert. Supabase MCP = SELECT/EXPLAIN read-only unless deliberately migrating.
- **TRAP — a "Fact-Forcing Gate" hook fires on every Write/Edit** (and some scratchpad writes). Have 4 facts ready: (1) who calls/imports the file, (2) no existing file serves the purpose, (3) data field/format if any, (4) the verbatim user instruction. Present them, retry.
- **TRAP — `npm run build` churns `public/pwa-config.json` (`appBuildId`).** Always `git checkout -- public/pwa-config.json` before committing.
- Gate test suites: `npm run test:read-nav` (4), `test:read-mode` (6), `test:pwa` (49); faham via `npx tsx --test src/lib/faham/*.test.ts` (66); hifz page-words/progressive-unveil/tebuk are VITEST (`npx vitest run`), and `tebuk.test.ts` has a PRE-EXISTING failure (not yours). `test:mushaf-view` is a dead script ref.
- ESLint boundary rule (Wave 0) enforces: no cross-feature internal imports (use the `@/features/<x>` barrel), no Supabase client outside `src/data/**`. `npm run lint` must stay 0-errors.
- Bootstrap files: `CLAUDE.md` (hard rules), this doc, `docs/HANDOVER.md`.

## 8. SPEC MAP (all under docs/superpowers/specs/, dated 2026-07-13)
- `consolidation-rebuild-launch-design.md` — the program (v1.2).
- `target-architecture-DRAFT.md` — restructure blueprint (ratified §8).
- `audit-report-and-triage.md` — the 6 root-fixes + deferred findings.
- `performance-cost-ledger.md` — 11 perf/cost root causes + apply-now/data-layer/deploy split + the 6 repository perf invariants.
- `load-time-perf-audit.md` — faham deep-dive.
- `tasmi-mode-design-operator-vision.md` + `tasmi-engine-upgrade-ladder.md` + `tasmi-feasibility-spike-report.md` — Tasmi.
- `coverage-metric-and-product-improvements.md` — the NORTH-STAR: coverage metric + recommender + product reshape.

Verify everything against live `git`/`npm`/Supabase state before acting. When in doubt, re-run the gate — done = the gate bites, not the worker's green.
