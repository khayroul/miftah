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

## Pre-restructure audit + fix-now sprint (2026-07-13) — DONE except migration lane
Audit: 8 read-only lanes + triage → `docs/superpowers/specs/2026-07-13-audit-report-and-triage.md` (~9 CRIT / ~37 MAJOR; 6 root-fixes fix-now, rest routed to Phase-1/2/Lane C). Fix-now sprint landed on main:
- **RF-1** (`4dfca92`) security: execFile TTS (no shell), auth+size-caps on tasmi-transcribe + feedback, backslash open-redirect fix (+test), full .env contract, **Telegram bot RETIRED for v1** (fail-closed + removed from build/start scripts + `src/bot/RETIRED.md`; operator still must stop any running launchd/systemd service).
- **RF-2** (idempotency): app-level `src/lib/faham/idempotency.ts` (30s window keyed on `last_review`, null-safe) on faham rate/exposure + hifz rate-batch; `handleContinue` re-entrancy guard; getOrCreateSabak 23505 graceful. **Migration follow-up (batched w/ RF-5 behind backup gate):** `vocab_exposure_events` needs `event_id TEXT` + `UNIQUE(user_id,event_id)` for ROBUST exposure dedup (B6 is best-effort app-level today).
- **RF-3** (`9288067`+`a499fff`): MCQ dedupe (correct answer can't appear twice) + per-attempt shuffle/direction, callers wired (`queue.ts` reps, `offlineQueue.ts` nowIso).
- **RF-4** (`db6b28e`): faham engine exposure-gate live (`minOccurrenceWeight` 1→4, product intent) + masteredCards crash guard; 3 RED engine tests now green.
- **RF-6: NO FIX — W-J B1 REFUTED.** Verified against real layout data (32:15): sajdah + ayah-number are TWO separate glyphs, `trailingSignsCount=2` is correct. Sacred render untouched. Stray Genesys-repo worktree the lane wrongly created was cleaned up.
- **RF-5 (PENDING, backup-gated):** tema progress stable-id re-keying + migration. Batch the RF-2 B6 exposure event_id migration into the same backup-gated lane.

## Tasmi' vision (operator 2026-07-13) — Lane C source LOCKED
`docs/superpowers/specs/2026-07-13-tasmi-mode-design-operator-vision.md`. Mode A recite-a-page (live word-follow highlight + on-error 3-word talqin → silent → repeat to page end). Mode B juzuk exam (read random test-ayah → recite to page end → NEXT loop). Resolved: Mode B has per-session exam/practice toggle; v1 = word-sequence only (no tajwid); fallback = phrase-level if word-level real-time isn't feasible. **Lane C opens with a feasibility spike** before promising the live-highlight UX.

## Worktree/merge note
`isolation:worktree` from a Genesys-rooted session creates a GENESYS worktree (wrong repo). Fix lanes correctly made their own `~/miftah-worktrees/<RF>` off miftah main. Tower merges each with `--no-ff` from `/Users/Executor/miftah`, re-verifies (tests+build), then `git worktree remove` + `git branch -d`. Two pre-existing stashes on miftah main ("before hifz rebase", offline-shell WIP) — provenance unknown, left untouched.

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
