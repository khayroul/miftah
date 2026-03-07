# Miftah (مفتاح) — Claude Code Context

## Project Overview
Miftah is a Quran memorization app: "Memorize the Quran by understanding, not just repetition."
Target: Malaysian Muslims. Primary language: Bahasa Malaysia + English.
**Current Phase: 0 — Foundation (Gate A + Gate B + Infrastructure)**

## Build Plan
Full specification: `BUILD_PLAN.md` (Harmonized Plan v1.5)

## Tech Stack
| Component        | Choice                              |
|------------------|-------------------------------------|
| Frontend         | Next.js 16 + Tailwind CSS 4        |
| Database         | Supabase (PostgreSQL, v2 schema)    |
| Hosting          | Vercel                              |
| Arabic Rendering | Pre-rendered images (Cairo + Pango) |
| SRS Engine       | FSRS via ts-fsrs                    |
| Audio            | Mishari Rashid via EveryAyah.com    |

## Directory Structure
```
/src                    Next.js app (App Router, TypeScript)
/scripts/render         Cairo/Pango rendering pipeline
/scripts/translate      BM translation batch resolution
/assets/pages           Mushaf page PNGs + thumbnails
/assets/ayat            Per-ayah PNGs
/assets/words           Per-word PNGs
/assets/manifests       JSON position manifests
/test/golden            Baseline golden pages + manifests
/supabase/migrations    Schema migration files
```

## Naming Conventions
| Asset           | Pattern                          | Example                |
|-----------------|----------------------------------|------------------------|
| Mushaf page     | page_{NNN}.png                   | page_001.png           |
| Thumbnail       | page_{NNN}_thumb.png             | page_001_thumb.png     |
| Page manifest   | page_{NNN}.manifest.json         | page_001.manifest.json |
| Ayah image      | ayah_{SSS}_{AAA}.png             | ayah_002_255.png       |
| Ayah manifest   | ayah_{SSS}_{AAA}.manifest.json   | ayah_002_255.manifest.json |
| Word image      | word_{WWWWW}.png                 | word_00042.png         |

## File Naming (Code)
- Components: PascalCase (`MushafView.tsx`)
- Utilities: camelCase (`fsrsScheduler.ts`)
- Routes: kebab-case (`/surah/[id]/page.tsx`)

## Database
- Supabase project with 6 data layers (already built)
- Migrations go in `/supabase/migrations/` with timestamp prefix
- FSRS fields: stability, difficulty, elapsed_days, scheduled_days, reps, lapses, state, due, last_review
- user_id: hardcoded UUID for single-user. RLS written now, activated with auth later.

## Testing
- Golden page tests in `/test/golden/`
- Rendering regression: pixel diff <0.5% against baselines
- Component tests alongside components

## Git Conventions
- Branch: `phase-{N}/{feature-name}` (e.g., `phase-0/repo-scaffold`)
- Commits: conventional commits (`feat:`, `fix:`, `chore:`, `docs:`)
- Khairul is dispatcher and merge authority

## Key Rules
- FSRS only. Never implement SM-2.
- ts-fsrs library. Do not implement FSRS math from scratch.
- Arabic rendering is pre-rendered images, never web fonts at runtime.
- Reading mode stays sacred — minimal UI chrome.
- Missing manifest → image without hitboxes (never crash).
- Missing word → text fallback (never crash).
