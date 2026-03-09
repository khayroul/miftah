# Miftah Build Status Snapshot

Updated: 2026-03-09
Reference: `BUILD_PLAN.md` v1.5

## Phase 0 — Foundation

### Parallel Infrastructure (5.1.1)

| Task | Status | Evidence |
|---|---|---|
| C1 Repo scaffold | Done | `src/`, `scripts/`, `assets/`, `test/golden/`, `supabase/migrations/` exist |
| C2 Supabase migration (FSRS + review_log + rendering_errors) | Done (schema file) | `supabase/migrations/001_initial_schema.sql` contains FSRS fields, `review_log`, `rendering_errors` |
| C3 Next.js + Supabase + Tailwind scaffold | Done | Next app routes/components exist in `src/app` and `src/components`; Supabase client in `src/lib/supabase.ts` |

### Gate A — Translation Pipeline (5.1.2)

| Item | Status | Evidence |
|---|---|---|
| A1-A3 pipeline scripts and outputs | Done | `scripts/translate/*`, `data/bm_wbw_complete.json`, `data/bm_wbw_flagged.json`, `data/bm_wbw_review.csv` |
| A4 human review flow | Partial | Review artifacts exist; manual acceptance still human-dependent |
| A5 imported production BM | Done (data check) | Supabase count: `ayat=6236`, `ayat.display_bm NOT NULL=6236`, `bm_flagged=true=0` |
| Gate A pass criteria | Likely pass, manual criteria pending confirmation | Data criteria met; spot-check/human-review signoff not auto-verifiable here |

### Gate B — Rendering Pipeline (5.1.3)

| Task | Status | Evidence |
|---|---|---|
| B2 golden pages assets | Done for page+manifest | Golden assets and manifests under `test/golden` |
| B5 full 604 page set | Done (page+thumb+manifest) | `assets/pages`: `page_*.png=604`, `page_*_thumb.png=604`; `assets/manifests/page_*.manifest.json=604` |
| Regression criterion (<0.5%) | Done (exceeded) | New checker reports exact parity (`0 px`) for all 604 pages |
| Exact iOS parity | Done | `test/reports/ios_parity_report_full.json` shows 604/604 exact match |
| B6 completeness check for all asset classes | Done | `official_completeness_report_full.json` => pages 604, thumbs 604, page manifests 604, ayah images/manifests 6236, word images 85104, all missing=0 |
| B7 CDN upload | Done | Supabase Storage buckets `mushaf-pages` + `mushaf-manifests` populated via `npm run render:upload-cdn` (1812 objects) |
| B8 mobile tap tests (3+ pages) | Partial | Automated iPhone emulation passed on 4 pages (`test/reports/mobile_tap_qa/report.json`); real-device checklist created at `test/reports/mobile_tap_qa/manual_checklist.md` |
| Gate B pass criteria | Near-complete | All technical checks pass; remaining item is real-device tap signoff |

## Phase 0.5 — Telegram Bot

| Feature | Status | Evidence |
|---|---|---|
| T1 Vocab flashcard | Done | `src/bot/handlers/vocab.ts`, callback rating flow |
| T2 Daily scheduler (Sabak/Sabqi/Manzil) | Done | `src/bot/services/scheduler.ts`, `src/bot/handlers/hifz.ts` |
| T5 Progressive blanking | Done | `src/bot/services/blanking.ts`, callback `bl:*` |
| T7 /stats | Done | `src/bot/handlers/stats.ts` |
| T8 Ayah-of-the-day | Done | `/aotd` handler in `src/bot/handlers/aotd.ts`, wired in `src/bot/index.ts` |
| T3 MCQ quiz | Done | `/quiz` command + callback flow in `src/bot/handlers/quiz.ts`, wired in `src/bot/index.ts` and `src/bot/handlers/callback.ts` |
| T4 Mutashabihat alerts | Pending | No alert flow found |
| T6 Translation review in bot | Pending | No dedicated review workflow found |

## Phase 1 — Core Reading (current web)

| Item | Status | Evidence |
|---|---|---|
| Mushaf page view | In progress | `/read/[page]` renders official page image + hitboxes |
| Tap word meaning | Done (BM/EN) | `src/lib/wbwTranslations.ts`, `src/components/MushafPageView.tsx` |
| Feature completeness (surah flow, offline, richer interactions) | Pending | Not fully implemented per Phase 1 scope in plan |

## Current Practical Position

1. Exact Quran.com iOS page parity is now solved for all 604 pages.
2. Gate A data looks complete from DB counts, pending manual-signoff criteria.
3. Gate B is almost closed; remaining operational item is real-device tap signoff.
4. Bot MVP core flows plus T8 are implemented; T3/T4/T6 remain.
