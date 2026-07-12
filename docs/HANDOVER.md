# Miftah — Session Handover

**Last updated:** 2026-07-13 (consolidation Tower session, Genesys-rooted)
**Program:** Consolidation → Rebuild → V1 Launch — spec v1.2 at `docs/superpowers/specs/2026-07-13-consolidation-rebuild-launch-design.md`

## Current state (Phase 0 — locally COMPLETE, push pending)

- Dirty tree landed as 10 logical commits (W-A); build + suites green (`test:mushaf-view` broken pre-existing; vitest whole-repo shows `node:test` runner-mismatch noise, not failures).
- **Merge train dissolved:** all 9 apparently-unmerged branches proven duplicates of squash-merged PRs (#2–#8) via patch-id/squash-parent/byte-diff proofs; 11 local refs deleted (only `main` remains locally). 11 remote stale refs await deletion (bundled with push go).
- Satellites archived → `~/_archive-miftah-consolidation-2026-07-13/` (tasmi-spike, standalone tasmi-server clone, symphony workspaces; WHY-ARCHIVED.md inside). In-repo `tasmi-server/` is canonical (client byte-compatible with it alone).
- No backports needed from the Genesys port (both MIFTAH-PARITY-1 fixes were port-only bugs; verified NO-GAP in truth).
- Visual baseline captured + committed: `docs/baseline/2026-07-13/` — 17 routes × 4 viewports, 68 shots, manifest verified 1:1, at SHA `6701568`.
- Spec review loop converged at v1.2 (15 round-1 findings fixed; round-2 wording pass applied).
- Genesys side: miftah-lab demoted, parity program CLOSED (Genesys D-374, commit `4c06ae6a2`).
- Local tag: `v1-base` (annotated) — pushed together with main on operator go.

## Production facts (W-H audit, 2026-07-13, read-only)

- Supabase project `axjuolsguunsvqhmeveq` ("Miftah", ap-southeast-1), ACTIVE_HEALTHY.
- **71 real auth.users, ~42.5k rows live progress data, writes through 2026-07-09.** NOT single-user by table structure, but usage-pattern analysis (2026-07-13, aggregate SQL, no PII) revises the risk picture: 86% of signups landed in the app's first week (2026-03-09), zero new signups since mid-April, 97%+ of review-log activity happened in the first 2 weeks, and **39 of 42 engaged accounts have been dormant 90+ days** — only 1 account active in the last 7 days (near-certainly the operator; ~65% of all Faham activity is one account). Read: a mostly-dormant early-cohort + operator dogfooding, not an active daily user base. Migration/redesign blast radius is lower than raw row-counts implied; a win-back email on relaunch is worth considering. Faham (vocab MCQ) was the feature with actual adoption pull; Hifz never caught on with this cohort.
- Migrations: 13/17 applied; pending 14–17 verified additive-safe (tasmi_sessions, profile trigger, RPC, dashboard snapshot). TRUNCATE migration already fired 2026-03-11 (historical).
- Security debt: 18 corpus tables anon-WRITABLE (RLS off); 5 SECURITY DEFINER views; 2 mutable search_path functions; leaked-password protection off. Board task: harden (fold into Lane A or early lane).

## What is next

1. **OPERATOR GATES (blocking):** (a) confirm who the 71 users are + give push/deploy GO (15 commits + 11 remote branch deletions + v1-base tag); (b) ratify architecture draft §8 (5 open questions); (c) start Bayarcash merchant onboarding (multi-week KYC); (d) start VPS credential rotation; (e) archive `khayroul/miftah-tasmi-server` on GitHub; (f) Telegram bot disposition decision (retire-for-v1 vs port — spec Phase-0 item 7).
2. After (b): Phase 1 Wave 0 (scaffold `data/` `ui/` `shared/` + ESLint boundary rule + license stub) → waves 1–8 per draft. Run these sessions **rooted in `~/miftah`**, one mutating session at a time.
3. Phase 2 per spec (design system → screens; Lanes A/B/C/D). Genesys factory sessions build sales page + marketing assets only.

## Known open issues

- **sw build-id churn:** commit `91506e3` hardcoded injected build ids (`public/sw.js` `82323e5` vs `pwa-config.json` `a408225` — inconsistent) and `01937d1` dropped `prebuild` from `build`; a `prebuild:pwa-config` script still churns `appBuildId` on build. Needs a deliberate fix: restore deploy-time injection OR commit ids consistently. Decide in Phase 1 Wave 0.
- `test:mushaf-view` references a nonexistent test file (pre-existing).
- `/dashboard-preview` renders seeded data via `MIFTAH_USER_ID` env — review before launch (it stays non-public).

## Session log

- **2026-07-13 (this session):** Program designed + ratified (6 operator decisions), spec v1.0→v1.2, 10 worker lanes (W-A..W-I incl. re-dispatches), Phase 0 locally complete. One prompt-injection attempt via a worker result — discarded, lane re-dispatched cleanly.
