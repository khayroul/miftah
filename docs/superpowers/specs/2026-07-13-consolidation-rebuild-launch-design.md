# Miftah Consolidation → Rebuild → V1 Launch — Design Spec

**Date:** 2026-07-13 · **Version:** 1.1 (post spec-review fixes; see §9)
**Status:** APPROVED (operator, this date); v1.1 fixes applied from adversarial spec review (W-F)
**Owner:** Khairul (operator) / Tower session (orchestration)
**Supersedes:** parity-chasing program in Genesys `docs/miftah-lab-vercel-parity-*.md` (CLOSED per Genesys D-374)

---

## 1. Operator decisions (ratified in design session)

| # | Decision | Choice |
|---|---|---|
| 1 | Canonical base | **Original repo `~/miftah`** (GitHub `khayroul/miftah` → Vercel, Supabase). Genesys `miftah-lab` demoted to factory demo (D-374). |
| 2 | Sell model | **One-time app sales / licenses** (lifetime-style, not subscription) |
| 3 | Auth | **Supabase Auth** (activate existing multi-user + RLS scaffolding; Clerk change from Genesys port does NOT carry over) |
| 4 | V1 scope | **Tasmi IN v1** (client lib + faster-whisper server productionized) |
| 5 | Payment rail | **FPX via Bayarcash (Curlec fallback)**; manual-grant path for day-one/WhatsApp sales |
| 6 | Launch bar | Polished launch; **code architecture restructure + full visual redesign before launch** |
| 7 | Timeline | ~8–10 weeks (restructure + redesign moved the original 4–6 week bar; operator informed) |

## 2. End state

One canonical repo (`~/miftah`) with:
- New architecture: `features/` modules (**read, hifz, faham, tema, tasmi, auth, license, onboarding, sales, checkout/activation**), repository data layer over Supabase, `ui/` design-system layer, files <400 LOC, typed boundaries.
- New visual identity: token-based design system, every screen rebuilt in it. Mushaf/QCF rendering itself untouched (sacred).
- Supabase Auth multi-user + RLS active; license gate server-side.
- **Telegram bot disposition decided (Phase 0) and executed in its owning phase** (retirement → Phase 0; port to multi-user id model with RLS-coexistent writes → Lane A).
- Buyer flow: FPX checkout → webhook (Supabase Edge Function) → `licenses` row → sign-in unlocks app → **in-app install guide (iOS/Android add-to-homescreen)**.
- **Refund/support model published** (policy page + contact channel) before first sale.
- Tasmi server (FastAPI + faster-whisper) deployed on VPS behind API key; client wired via env.
- PWA hardened (iOS offline suite passing) **including a service-worker update path: cache-version bump + skipWaiting/clients.claim + in-app update prompt, so existing installs receive the redesigned app** (verified by stale-install → forced-update test).
- Version sprawl dead: **ALL branches (local + remote) triaged to zero**, satellites archived, miftah-lab demoted.

## 3. Phases

### Phase 0 — Consolidation + baseline (~1–1.5 weeks)
1. Land the dirty tree in `~/miftah` (32 files) as logical commits; push main.
2. **Full branch triage — RESOLVED 2026-07-13, merge train dissolved.** W-B proved at git-object level (patch-id equality / squash-parent identity / byte-diffs; Tower independently spot-checked 3 proofs) that **all 9 unmerged-looking branches are stale refs of already-squash-merged PRs (#2–#8)** — main is strictly newer everywhere. No merges needed or performed; all stale refs (local + remote) deleted. The feared offline-tema/faham-UX conflict work: phantom.
3. **Supabase production state audit + backup gate (BLOCKS any migration run):** determine applied-vs-pending migration state on prod (17 local migrations; `list_migrations`). **Full prod `pg_dump` backup with rehearsed restore before ANY migration runs.** Resolve explicitly: migration `20260311114500_reset_progress_and_enforce_auth_user_fks.sql` TRUNCATEs progress tables while a `legacy_user_backfill_function` migration also exists — either the backfill preserves the operator's real data or the operator explicitly accepts the reset in writing. No silent data loss.
4. Capture baseline: screenshot corpus of every route at 360/390/768/1024 + full test suite green.
5. Tag `v1-base`; prep standalone-session bootstrap (`CLAUDE.md` + `docs/HANDOVER.md`) so Phase 1+ runs miftah-rooted sessions.
6. **tasmi-server reconciliation — DONE 2026-07-13 (W-G).** In-repo `tasmi-server/` confirmed canonical (strictly newer, client byte-compatible with it alone); standalone repo + spike + symphony workspaces held zero unmerged value and are archived at `~/_archive-miftah-consolidation-2026-07-13/` (see WHY-ARCHIVED.md). Lane C's reconciliation precondition: **satisfied**. GitHub-side archival of `khayroul/miftah-tasmi-server` = operator action.
7. **Telegram bot disposition — DECISION in Phase 0:** the live grammy bot (`src/bot/`, ~4.5k LOC, launchd service) writes to the same progress tables via service-role. Audit its user-id model against multi-user FKs; operator decides retire-for-v1 vs port. If **retire**: execute retirement in Phase 0. If **port**: the port implementation belongs to Lane A. **Lane A's precondition is the DECISION being made**, not the port completed.
8. Genesys side: DONE (D-374, commit `4c06ae6a2`) — miftah-lab demoted, parity program closed.
9. **Week-1 operator actions (lead-time-critical, start now):** (a) begin Bayarcash merchant onboarding (multi-week FPX KYC — Lane B's gate needs a live account by ~week 6); (b) begin VPS credential rotation (Lane C consumes rotated creds; rotation is not Lane C's job).

### Phase 1 — Architectural restructure (~2–3 weeks, behavior-preserving)
- Target-architecture spec ratified BEFORE file moves (drafted by architecture lane; operator approves).
- Strangler waves, one feature domain per wave.
- Per-wave exit gate: tests green AND screenshot-diff vs Phase-0 baseline within tolerance — **Playwright screenshots + pixelmatch, ≤0.1% changed pixels per route with dynamic regions (dates, streaks, live data) masked**. App deployable after every wave.
- **Vercel env/domain audit:** enumerate env-var changes (Supabase keys, TASMI_*, Bayarcash secrets incoming; no Clerk vars), confirm production domain ownership; miftah-lab demo must never claim the prod domain.
- Data layer built so auth + license land as clean modules.

### Phase 2 — Visual redesign + feature build (~3–4 weeks)
- **Design system first — falsifiable convergence bar:** cross-family judge panel (no family_collapse), every rubric axis (identity distinctiveness, Quranic typographic respect, legibility, spacing rhythm, dark mode, accessibility) **≥8/10 for 2 consecutive rounds with per-axis delta <0.5**. Screen rebuild and Lane D **start only after the bar is met** (staggered, not fully parallel).
- Screen-by-screen rebuild on new architecture: home, read chrome, hifz overview+session, faham, tema, settings, onboarding (new), auth screens, purchase/activation, sales page.
- Feature lanes:
  - **Lane A** Supabase Auth multi-user + RLS activation; includes the bot port if item-7 decision = port. **Precondition: item-7 DECISION made.** Gate: two accounts, isolated data; anon → sign-in wall; bot (if kept) still writes correctly under RLS.
  - **Lane B** `licenses` table + Bayarcash webhook Edge Function (fail-closed signature check) + manual-grant path. **Precondition: merchant account live (KYC started P0-9a; expected live ~week 6).** Gate: real RM1 FPX transaction unlocks app end-to-end. Manual-grant is the interim revenue rail, not a gate substitute.
  - **Lane C** Tasmi productionization on rotated VPS creds (item 6 satisfied; 9b rotation is the remaining precondition). Latency measured (large-v3 int8 CPU; drop model size if >10s/ayah), real-device mic QA. Gate: 3 ayat recited on real phone → correct word-level feedback <10s.
  - **Lane D** UX connective tissue, **trailing each route's rebuild** (runs per-route as rebuilt routes land, not concurrently with rebuild start). **Gate: per-route checklist signed off — every async surface has empty/loading/error states; offline indicator verified with network killed; reviewer walks every route.**
- **Service-worker redesign-migration:** cache-version bump + update-prompt flow implemented and tested (stale-install device receives forced update).

### Phase 3 — QA + launch (~1–2 weeks)
- Device matrix (iOS PWA priority) + offline suite.
- **Numeric floors:** Lighthouse PWA installable = pass; performance ≥85 mobile on home + read routes.
- **Whole-app AIL pass: launch rubric ≥8/10 on every axis**, cross-family panel.
- RM1 e2e purchase test on production.
- **Buyer dry-run PASS = a non-operator human completes purchase → sign-in → install (add-to-homescreen guide) → first hifz session unaided, zero blocking defects; all defects logged.**
- Refund/support policy live; Vercel instant-rollback procedure documented and tested once.

## 4. Sequencing logic
Restructure before redesign (restyle once, not twice). Redesign kit before screen rebuild (staggered). Consolidation + data-safety gates before everything. Lead-time items (merchant onboarding, VPS rotation) start week 1 regardless of their consuming lane's schedule.

## 5. Error handling, testing & data-safety invariants
- Every Phase-0 merge: suite + build green before next merge.
- **Named `pg_dump` backup artifact before EVERY prod migration; restore rehearsed once on a Supabase branch.**
- License check server-side (RLS/session claim), never client-only.
- Webhook fail-closed: unverifiable signature → no license write, logged.
- **`licenses` table backup cadence post-launch (daily export while sales run).**
- Tasmi server unreachable → graceful degradation (rest of app unaffected).
- Existing Playwright + unit tests are the floor; new code tested to same standard.
- Vercel deploy rollback: documented, one-click, tested in Phase 3.

## 6. Risks
| Risk | Mitigation |
|---|---|
| Merge-train conflicts (now 9+ branches incl. offline-tema 11-commit) | W-B full conflict map first; smallest/cleanest-first; cherry-pick fallback; per-merge smoke |
| Prod data loss from TRUNCATE migration | Phase-0 item 3 backup gate; truncate-vs-backfill resolved in writing before any run |
| Telegram bot breaks under RLS/multi-user | Phase-0 item 7 disposition before Lane A; coexistence test in Lane A gate |
| Stale PWA installs serve old app after redesign | SW cache-version + update-prompt + stale-install test (Phase 2) |
| Restructure regressions | pixelmatch-tolerance gate per wave; deployable after every wave |
| Redesign churn | numeric convergence bar (§3 Phase 2), append-only rubric |
| Whisper CPU latency | measure day 1; model-size fallback or small GPU box |
| VPS creds compromised | rotation starts week 1 (operator); Lane C consumes rotated creds only |
| Bayarcash onboarding lag | onboarding starts week 1 (operator); manual-grant interim rail |
| Scope creep across 8–10 wks | architecture spec + design rubric ratified once, append-only; new ideas → post-launch backlog |

## 7. Board operating mode
Tower orchestrates. Sonnet workers for mechanical lanes, Opus for judgment lanes. One mutating lane per repo at a time; read-only lanes parallelize freely. Per-landing: Tower re-verifies gate → explicit-path commit → refill slot. Phase 1+ build sessions run rooted in `~/miftah` (bootstrap per Phase-0 item 5); Genesys sessions return only for factory lanes (design/marketing assets).

## 8. Out of scope (v1)
Behavior changes during Phase 1; subscriptions; app-store native wrappers; Tasmi accuracy beyond the deployed-model floor; new features not listed in §2 (post-launch backlog).

## 9. CHANGELOG
- **v1.2 (2026-07-13):** W-F2 re-review wording pass (bot decide-vs-implement contradiction resolved; Lane B/C precondition timing precise; Lane D trails rebuild) + banked results: merge train dissolved (W-B duplicate proofs), tasmi-server reconciliation DONE (W-G). Review loop converged: W-F2 verdict = APPROVED conditional on this pass.
- **v1.1 (2026-07-13):** applied 15 findings from adversarial spec review (W-F): full-branch triage (not 5), Telegram-bot disposition gate, prod-migration backup gate + truncate/backfill resolution, week-1 lead-time operator actions (Bayarcash, VPS rotation), tasmi-server reconciliation promoted with owner+gate, SW redesign-migration path, Vercel env/domain audit, backup/rollback invariants, falsifiable gates (design convergence bar, Lane D checklist, Phase-3 numeric floors, pixelmatch tolerance), refunds/support + install guide, module list completed (onboarding/sales/checkout).
- **v1.0 (2026-07-13):** initial operator-ratified design.
