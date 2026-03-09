# Miftah (مفتاح) — Agent Instructions

Miftah is a Quran memorization app: "Memorize the Quran by understanding, not just repetition." Target: Malaysian Muslims. Primary language: Bahasa Malaysia + English. Owner: Khairul. **Current Phase: 0 — Foundation.**

## Build Plan

Full specification: `BUILD_PLAN.md` (Harmonized Plan v1.5)

## Tech Stack

| Component | Choice |
|-----------|--------|
| Frontend | Next.js 16 + Tailwind CSS 4 |
| Database | Supabase (PostgreSQL, v2 schema) |
| Hosting | Vercel |
| Arabic Rendering | QCF V2 fonts + Playwright (browser renderer) + PIL/FreeType (legacy) |
| SRS Engine | FSRS via ts-fsrs 5.2.3 |
| Audio | Mishari Rashid via EveryAyah.com |
| Bot | grammy 1.41.1 (Telegram) — Phase 0.5 |
| Language | TypeScript 5, Next.js App Router |

## File Map

```
src/
├── app/                    Next.js App Router
│   ├── layout.tsx          Root layout
│   ├── page.tsx            Home page
│   ├── read/               Mushaf reading routes
│   └── api/                API routes
├── bot/                    Telegram bot (grammy, FSRS review)
│   ├── index.ts            Bot entry point
│   ├── handlers/           Message handlers
│   ├── services/           FSRS + review logic
│   └── db/                 Bot database layer
├── components/
│   └── MushafPageView.tsx  Page display component
├── lib/
│   ├── fsrs.ts             FSRS scheduler config
│   ├── mushafAssets.ts     Asset path helpers
│   ├── queries.ts          Data queries
│   ├── supabase.ts         Supabase client
│   └── wbwTranslations.ts  Word-by-word BM translations
└── types/                  Shared types

scripts/
├── render/
│   ├── render_browser.mjs  Playwright-based renderer (primary)
│   ├── render_arabic.py    PIL-based renderer (legacy, ayah-level)
│   ├── upload_supabase_assets.ts  CDN upload
│   └── mobile_tap_qa.mjs   QA for tap targets
├── seed/                   Data seeding scripts
└── translate/              BM translation batch scripts

data/
├── mushaf-layout/          604 page JSONs (zonetecde/mushaf-layout clone)
├── qul/                    Tanzil Uthmani text + quran-data.xml
└── seed/                   verse_metadata.json

assets/
├── fonts/qcf-v2/           604 TTF fonts (QCF2_P001–P604)
├── fonts/qcf-v2-woff2/     604 WOFF2 fonts (p1–p604)
├── fonts/surah-names/      sura_names.woff2 (ornamental headers)
├── pages/                  Rendered mushaf page PNGs
├── ayat/                   Per-ayah PNGs
├── words/                  Per-word PNGs
└── manifests/              JSON bounding box manifests

test/golden/                Golden reference pages + manifests
supabase/migrations/        Schema migration files
```

## Asset Naming Conventions

| Asset | Pattern | Example |
|-------|---------|---------|
| Mushaf page | `page_{NNN}.png` | `page_001.png` |
| Thumbnail | `page_{NNN}_thumb.png` | `page_001_thumb.png` |
| Page manifest | `page_{NNN}.manifest.json` | `page_001.manifest.json` |
| Ayah image | `ayah_{SSS}_{AAA}.png` | `ayah_002_255.png` |
| Word image | `word_{WWWWW}.png` | `word_00042.png` |

## Code Naming

- Components: PascalCase (`MushafView.tsx`)
- Utilities: camelCase (`fsrsScheduler.ts`)
- Routes: kebab-case (`/surah/[id]/page.tsx`)

## Database

- Supabase project with 6 data layers (already built)
- Migrations in `/supabase/migrations/` with timestamp prefix
- FSRS fields: stability, difficulty, elapsed_days, scheduled_days, reps, lapses, state, due, last_review
- user_id: hardcoded UUID for single-user. RLS written now, activated with auth later.

## Arabic Rendering (QCF V2) — Critical Knowledge

- **604 per-page TTF fonts** — each mushaf page has its own font with unique glyph mappings
- **Codepoints:** U+FC41+ (Arabic Presentation Forms, page-specific)
- **Glyph data:** `data/mushaf-layout/mushaf/page-NNN.json` — `qpcV2` field per word
- **Primary renderer:** `scripts/render/render_browser.mjs` — Playwright (HTML to PNG)
- **Legacy renderer:** `scripts/render/render_arabic.py` — PIL/FreeType (ayah-level)
- **QCF glyphs are pre-shaped** — MUST bypass Arabic text shapers (Pango/HarfBuzz break them)
  - Browser rendering (no explicit shaping) works
  - PIL/FreeType (no shaping) works
  - Pango/HarfBuzz BREAKS the glyphs — never use
- **Justification:** CSS `text-align: justify` with `text-align-last: justify` per line
- **V1 vs V2:** V1 codepoints start U+FB51, V2 start U+FC41. V2 is the 1423H/2002 manuscript. The quran.com-images repo has V1 fonts (NOT V2)
- **Font family naming:** V1 = `QCF_P001`, V2 = `QCF2001`

## Known Rendering Bugs

1. **Basmala garbled text:** Basmala glyphs `U+FB51-FB53` are from a SEPARATE basmala font (QPC2BSML), not the per-page QCF font. Per-page fonts map those codepoints to different glyphs. **Fix:** download QPC2BSML font from quran.com CDN and load alongside page font for basmala lines.

2. **Page 586 missing surah-header + basmala:** Layout generator only adds headers when `currentSurahNumber !== null` and heuristic at lines 222-261 only matches line counts 13/14/6-7. Pages with 12 lines fall through. **Fix:** check if first verse is verse 1 regardless of line count.

## Scripts

```bash
npm run dev                              # Next.js dev server
npm run build                            # Next.js production build
npm run bot                              # Start Telegram bot
npm run bot:dev                          # Telegram bot with watch mode
npm run render:upload-cdn                # Upload assets to Supabase storage
npm run qa:mobile-tap                    # QA tap target accuracy
npm run seed:fetch-ayah-themes           # Fetch ayah theme chunks
```

## Git Conventions

- Branch: `phase-{N}/{feature-name}` (e.g., `phase-0/repo-scaffold`)
- Commits: conventional commits (`feat:`, `fix:`, `chore:`, `docs:`)
- Khairul is dispatcher and merge authority

## Key Rules — Do Not Violate

- **FSRS only.** Never implement SM-2.
- **ts-fsrs library.** Do not implement FSRS math from scratch.
- **QCF V2 fonts for Arabic.** Never use web fonts at runtime for Quran text.
- **Reading mode stays sacred.** Minimal UI chrome.
- **Graceful degradation.** Missing manifest = image without hitboxes (never crash). Missing word = text fallback (never crash).
- **No Pango/HarfBuzz/Cairo** for QCF rendering. They break pre-shaped glyphs.

## Testing

- Golden page tests in `/test/golden/`
- Rendering regression: pixel diff <0.5% against baselines
- Component tests alongside components

## Build Progress

- Gate A (translations): BM translations batch-resolved
- Gate B (rendering): Browser renderer built, sample pages rendered (1, 2, 3, 6, 77, 489, 586, 590, 604)
- Phase 0.5 (Telegram bot): Built with FSRS + Sabak/Sabqi/Manzil
- **Next:** Fix basmala font + surah-header generation, then render all 604 pages

## Juz Boundaries (page numbers)

1, 22, 42, 62, 82, 102, 121, 142, 162, 182, 201, 222, 242, 262, 282, 302, 322, 342, 362, 382, 402, 422, 442, 462, 482, 502, 522, 542, 562, 582

## Coding Rules

### Security

- Never hardcode API keys or secrets — always use `process.env`
- Never use string concatenation for SQL — parameterized queries only
- Never trust external data without validation
- Never log passwords, tokens, or PII
- Use Supabase RLS for row-level access control
- Sanitize user-generated content before rendering
- Error messages must not leak internal details to users

### TypeScript

- **Immutability:** always create new objects with spread (`{ ...obj, key: val }`), never mutate
- **Error handling:** try/catch with `console.error` + user-friendly return, never silently swallow
- **Graceful degradation:** missing manifest = image without hitboxes, missing word = text fallback — never crash
- **Input validation:** Zod schemas at system boundaries
- **File organization:** 200-400 lines typical, 800 max. Functions under 50 lines. No nesting >4 levels.
- **No `console.log`** in production code
- **No `any`** when a specific type is possible
- **No `as` type assertions** unless absolutely necessary
- **Do not implement FSRS math from scratch** — use ts-fsrs library

## CLI Tools Available on This Machine

gh, typst, pandoc, ffmpeg, jq, curl, playwright, ollama, imagemagick, edge-tts, tmux, ripgrep, memo (apple-notes), remindctl (apple-reminders), gog (google workspace)
