# GPT-5.6 Activation Prompt — Miftah

Paste the block below into a fresh GPT-5.6 / Codex session rooted in `/Users/Executor/miftah`.

---

You are taking over as engineer + orchestrator for **Miftah**, at `/Users/Executor/miftah`. A predecessor did a large consolidation + audit + restructure session and left you a complete handoff.

**Do this first, in order:**
1. Read `docs/SUCCESSOR-HANDOFF-2026-07-13.md` fully — it is self-contained (goal, program, state, in-flight lanes, gates, traps, spec map).
2. Read `CLAUDE.md` (hard rules) and skim `docs/superpowers/specs/2026-07-13-coverage-metric-and-product-improvements.md` (the north-star).
3. Verify live state: `git log --oneline -8`, `git branch`, `git status`, `git worktree list`.

**The goal (north-star):** Miftah = مفتاح = *the key to understanding the Quran*. The central metric is **Understanding Coverage %** (Σ frequency of a user's mastered words ÷ Σ all Quran frequency). Everything — the redesign, the curriculum (a guided "Understanding Path" with a next-best-words recommender), onboarding, relaunch — is being reorganized around making understanding measurable and central. Guard the data-quality caveat (verify the frequency source before "understand X%" goes public).

**Your immediate path:**
1. **Merge the two in-flight lanes** (verify each gate yourself first): branch `perf/double-auth` (worktree `~/miftah-worktrees/AUTH` — check whether it committed a safe auth fix or correctly stopped-and-deferred; this is AUTH, do not merge an unsafe fix) and branch `feat/understanding-engine` (worktree `~/miftah-worktrees/UND` — the coverage engine + data-quality verdict). `git merge --no-ff` from `~/miftah`, build+tests green, then `git worktree remove` + `git branch -d`. `git worktree prune` the stale `/private/tmp/miftah-*` ones.
2. **Continue the restructure at Wave 2 (tema)** per `docs/superpowers/specs/2026-07-13-target-architecture-DRAFT.md` §3. Behavior-preserving, move-only where possible, per-wave gate = tests green + zero pixel-diff vs `docs/baseline/2026-07-13/` + deployable. Waves after: 3 tasmi → 4 home → 5 faham (build the coverage recommender here) → 6 hifz → 7 read → 8 shared/pwa+repository.
3. Deeper perf fixes = the ledger (`docs/superpowers/specs/2026-07-13-performance-cost-ledger.md`), built INTO the data layer during the waves, not bolted on.

**Operating rules (from the handoff §7 — read them):** board loop = dispatch worktree-isolated worker → re-verify the gate yourself → merge explicit paths → clean up. Traps: worktree isolation may give the wrong repo (make your own miftah worktree); `EXPLAIN ANALYZE` on a write executes it (SELECT/EXPLAIN read-only on Supabase MCP); a Fact-Forcing Gate hook fires on every Write/Edit (have 4 facts ready); `npm run build` churns `public/pwa-config.json` (revert it).

**Do NOT without an explicit operator "go":** push to `origin main` / deploy (it runs a DESTRUCTIVE tema TRUNCATE migration + deploys to ~71 real users). Migrations are staged; the safe perf indexes are already applied to prod.

Confirm you've read the handoff, then tell the operator the verified current state and your proposed next lane before dispatching.
