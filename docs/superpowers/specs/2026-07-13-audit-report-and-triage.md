# Miftah Pre-Restructure Audit — Report & Triage

**Date:** 2026-07-13 · **Status:** Findings verified; fix-now sprint awaiting operator scope decision
**Method:** 8 parallel read-only audit lanes (one per surface) + 1 opus triage lane, Tower-verified. Program: `2026-07-13-consolidation-rebuild-launch-design.md`.

## Why this audit ran now
Phase 1 is a *behavior-preserving* restructure — it would freeze whatever bugs exist today into the new baseline. So we audit first, fix the ones that would get frozen, re-capture the baseline over corrected behavior, then restructure.

## Totals
~9 CRITICAL, ~37 MAJOR, plus minor/polish, across auth/security, read/mushaf, hifz/FSRS, faham, tema, tasmi, PWA/offline, runtime QA. No crashes/blank pages at runtime (34/34 routes 200).

## Triage rule
A bug needs fixing *before the baseline freeze* only if it is (a) security-CRITICAL, (b) persistent-STATE corruption on a surface Phase 2 will NOT auto-rebuild, (c) a RED test (blocks the Phase-0 tests-green gate), or (d) wrong-core-content in code Phase 2 leaves alone (SACRED mushaf render, seed keying). Everything else is fixed for free when Phase 2 rebuilds that surface — pre-fixing is wasted work.

## FIX-NOW — 6 root-fixes (grouped by root cause, not 45 line items)

| # | Root-fix | Closes | Effort | Verified |
|---|---|---|---|---|
| RF-1 | Security holes: execFile-not-shell TTS, auth+size-cap on 2 unauth routes, backslash sanitize, complete .env contract, bot auth gate fail-closed | W-P F1,F4,F5,F6,F9 (F2 via bot disposition) | M | F1/F4/F5/F6/F9 Tower-verified |
| RF-2 | Server-side idempotency + client re-entrancy guard (faham=65% of usage) — kills mastery/exposure/FSRS corruption on double-submit | W-L B1,B1a,B6; W-K B3,B8 | M | B1/B6/W-K B3 verified |
| RF-3 | Faham MCQ integrity — per-attempt option/direction randomization; correct answer can't appear twice as a distractor | W-L B2,B3,B8 | M | B2/B3/B8 verified |
| RF-4 | Faham engine gates + crash guard — greens the 3 RED engine tests (blocks the Phase-0 tests-green gate) | W-L B4,B9 | S | Tower ran tests RED |
| RF-5 | Tema progress keyed by stable content id, not volatile positional index — stops silent progress re-attribution on any future chunk edit (carries a DB migration) | W-M B2 | M | verified |
| RF-6 | Mushaf sajdah glyph classification (SACRED render — fix window is NOW; Phase 2 leaves render untouched) | W-J B1 | S | code assumption verified; 15/15 count lane-asserted |

## Judgment calls (adversarial, not rubber-stamped)
- **Hifz state-corruption (W-K B1 client-trusted transitions, B2 age-only promotion) demoted OUT of fix-now** — real+verified, but hifz has ~0 adoption so negligible data accrues and the freeze concern is near-void → Phase-2 hifz rebuild.
- **All Tasmi (W-N T-01..T-12) → Lane C** (Phase-2 builds/productionizes Tasmi; pre-fixing before that lane exists is wasted). T-07 VPS TLS = operator week-1 cred rotation.
- **All PWA/SW (W-O) → Phase-2 SW-migration lane** (already scheduled), except B1 (version source-of-truth trap) is a *precondition* for the redesign update-prompt (do early) and B2 (audio-206→fake-503) is a cheap one-line win.
  **Wave-8 restructure boundary (2026-07-13):** neither defect is changed by the behavior-preserving `shared/pwa` relocation. The build-ID source-of-truth repair and HTTP 206 audio handling remain explicit Phase-2 SW-migration work, with stale-install/update and ranged-audio regression tests required there.
- **Tebuk/Unveil (W-K B4/B5) → DEFER**: incomplete features, not regressions.
- **Disputed:** W-K B2 "dumped to lowest bucket" wording is backwards (manzil is higher); the age-only-promotion bug is real, the description isn't. W-Q F-06/F-07 are not findings (harness timing; vacuous img checks).

## PHASE-2-BACKLOG (redesign rebuilds these anyway)
Login dead-end on /faham + /hifz (W-Q F-01), faham stats console.error (F-02), mobile 25px overflow on read routes (F-03), orphaned /tools route (F-05), ThemeToggle focus ring, tema short-chunk completion (W-M B3), tema coverage gaps (W-M B1 — content task), dashboard Tema% overcount (W-M B5), faham "found" double-definition (W-L B5), offline known-word exclusion (W-L B7), all W-O SW findings, faham double stats-fetch (W-L B10).

## DEFER/ACCEPT
Tebuk/Unveil wiring (feature), Tasmi surface (Lane C), hifz corruption bugs (Phase-2 hifz), streak UTC-vs-local (W-K B7 — Phase-2), tema override memoization/dead-code (Phase-1-fold during tema wave).

## Recommended fix-now SEQUENCE (respects the re-baseline-after gate)
1. **RF-4** (green the RED tests — baseline capture is blocked until green)
2. **RF-1** (security; F2 rides the operator's bot-disposition decision)
3. **RF-2 ∥ RF-3** (faham; disjoint files → parallelize)
4. **RF-6** (sacred glyph; needs a real-render review)
5. **[Phase-0 pg_dump backup gate]** → **RF-5** (carries a DB migration — backup first)
6. **Re-capture the screenshot baseline over corrected behavior** → Phase 1 proceeds

## Preconditions bound into fix-now
- RF-1 F2 (bot gate) depends on the operator's **Telegram bot disposition** (retire vs keep — spec Phase-0 item 7). Retire → F2 resolves itself.
- RF-5 depends on the **pg_dump backup gate** (spec §5) before its migration runs.
