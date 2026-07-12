# Miftah Consolidation → Rebuild → V1 Launch — Design Spec

**Date:** 2026-07-13
**Status:** APPROVED (operator, this date)
**Owner:** Khairul (operator) / Tower session (orchestration)
**Supersedes:** parity-chasing program in Genesys `docs/miftah-lab-vercel-parity-*.md` (that program CLOSES)

---

## 1. Operator decisions (ratified in design session)

| # | Decision | Choice |
|---|---|---|
| 1 | Canonical base | **Original repo `~/miftah`** (GitHub `khayroul/miftah` → Vercel, Supabase). Genesys `miftah-lab` demotes to factory demo. |
| 2 | Sell model | **One-time app sales / licenses** (lifetime-style, not subscription) |
| 3 | Auth | **Supabase Auth** (activate existing multi-user + RLS scaffolding; Clerk change from Genesys port does NOT carry over) |
| 4 | V1 scope | **Tasmi IN v1** (client lib + faster-whisper server productionized) |
| 5 | Payment rail | **FPX via Bayarcash (Curlec fallback)**; manual-grant path for day-one/WhatsApp sales |
| 6 | Launch bar | Polished launch; **code architecture restructure + full visual redesign before launch** |
| 7 | Timeline | ~8–10 weeks (restructure + redesign moved the original 4–6 week bar; operator informed) |

## 2. End state

One canonical repo (`~/miftah`) with:
- New architecture: `features/` modules (read, hifz, faham, tema, tasmi, auth, license), repository data layer over Supabase, `ui/` design-system layer, files <400 LOC, typed boundaries.
- New visual identity: token-based design system, every screen rebuilt in it. Mushaf/QCF rendering itself untouched (sacred).
- Supabase Auth multi-user + RLS active; license gate server-side.
- Buyer flow: FPX checkout → webhook (Supabase Edge Function) → `licenses` row → sign-in unlocks app.
- Tasmi server (FastAPI + faster-whisper) deployed on VPS behind API key; client wired via env.
- PWA hardened (iOS offline suite passing).
- Version sprawl dead: 5 branches triaged to zero, satellites archived, miftah-lab demoted.

## 3. Phases

### Phase 0 — Consolidation + baseline (~1 week)
1. Land the dirty tree in `~/miftah` (32 files) as logical commits; push main.
2. Merge all 5 branches, smallest-first:
   `fix/ios-pwa-offline-navigation` → `feat/pwa-hardening` → `codex/hifz-chunked-audio-pre-sync-20260314` → `feat/mushaf-full-download` → `codex/kha-17-faham-first-session-ux`.
   Each merge: tests green + manual smoke of touched surface. Cherry-pick fallback for hostile rebases.
3. Backport the two verified Genesys-port fixes **verify-first** (Hifz session flow wiring; Faham stats derivation) — re-implement against truth code only if the same gap exists (evidence: Genesys `docs/miftah-lab-vercel-parity-audit.md` §14).
4. Capture baseline: screenshot corpus of every route at 360/390/768/1024 + full test suite green. This is the refactor/redesign safety net.
5. Tag `v1-base`.
6. Genesys side: demote miftah-lab (README + parity-doc closure note); archive `miftah-tasmi-spike` + `code/miftah-symphony-workspaces` to cold storage. `miftah-tasmi-server` repo content reconciles into this repo's `tasmi-server/`.

### Phase 1 — Architectural restructure (~2–3 weeks, behavior-preserving)
- Target-architecture spec ratified BEFORE file moves (drafted by architecture lane; operator approves).
- Strangler waves, one feature domain per wave.
- Per-wave exit gate: tests green AND screenshot-diff vs Phase-0 baseline = zero visual change. App deployable after every wave.
- Data layer built so auth + license land as clean modules.

### Phase 2 — Visual redesign + feature build (~3–4 weeks, parallel lanes)
- Design system first: new token contract + component kit, iterated via adversarial-improvement loop (cross-model review, fixed rubric, score ledger) to convergence. Rubric: identity distinctiveness, Quranic typographic respect, legibility, spacing rhythm, dark mode, accessibility.
- Screen-by-screen rebuild on new architecture: home, read chrome, hifz overview+session, faham, tema, settings, onboarding (new), auth screens, purchase/activation, sales page.
- Feature lanes in the same phase, building directly in new architecture + kit:
  - **Lane A** Supabase Auth multi-user + RLS activation. Gate: two accounts, isolated data; anon → sign-in wall.
  - **Lane B** `licenses` table + Bayarcash webhook Edge Function (fail-closed signature check) + manual-grant path. Gate: real RM1 FPX transaction unlocks app end-to-end.
  - **Lane C** Tasmi productionization: VPS deploy (HARD GATE: VPS credential rotation first), latency measured (large-v3 int8 CPU; drop model size if >10s/ayah), real-device mic QA. Gate: 3 ayat recited on real phone → correct word-level feedback <10s.
  - **Lane D** UX connective tissue: empty/loading/error states, micro-interactions, offline indicators.

### Phase 3 — QA + launch (~1–2 weeks)
Device matrix (iOS PWA priority), offline suite, Lighthouse, whole-app AIL pass, RM1 e2e purchase test, buyer dry-run with a non-operator human, launch.

## 4. Sequencing logic
Restructure before redesign (restyle once, not twice). Redesign with feature build (new surfaces built once, in the new kit). Consolidation before everything (kill drift before lanes land on it).

## 5. Error handling & testing invariants
- Every Phase-0 merge: suite + build green before next merge.
- License check server-side (RLS/session claim), never client-only.
- Webhook fail-closed: unverifiable signature → no license write, logged.
- Tasmi server unreachable → graceful degradation (rest of app unaffected).
- Existing Playwright + unit tests are the floor; new code tested to same standard.
- Single-user → multi-user migration rehearsed on Supabase branch/backup before production.

## 6. Risks
| Risk | Mitigation |
|---|---|
| Merge-train conflicts (faham UX rework 1232+ LOC) | smallest-first order; cherry-pick fallback; per-merge smoke |
| Restructure regressions | screenshot baseline + zero-visual-diff gate per wave; deployable after every wave |
| Redesign churn | AIL rubric + score ledger with convergence threshold |
| Whisper CPU latency | measure day 1; model-size fallback or small GPU box |
| VPS creds compromised | rotation is a hard gate before tasmi deploy |
| Bayarcash onboarding lag | manual-grant path sells from day one |
| Scope creep across 8–10 wks | architecture spec + design rubric ratified once, append-only; new ideas → post-launch backlog |

## 7. Board operating mode
Tower (this session) orchestrates. Sonnet workers for mechanical lanes, Opus for judgment lanes. One mutating lane per repo at a time; read-only lanes parallelize freely. Per-landing: Tower re-verifies gate → explicit-path commit → refill slot.
