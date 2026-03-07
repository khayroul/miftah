# MIFTAH — مفتاح
## Harmonized Build Plan v1.5

> *Memorize the Quran by understanding, not just repetition.*

**March 2026 • Build tool: Claude Code (sole builder)**

Sources: Scope Doc + ChatGPT Spec + Claude Harmonization + Pre-Build Contracts

---

---

# 1. Product Identity

Name: Miftah (مفتاح) — The Key

Tagline: Memorize the Quran by understanding, not just repetition.

Target Users: Malaysian Muslims seeking Quranic understanding and hifz — primarily without formal Arabic language training.

Primary Language: Bahasa Malaysia (AI-resolved from Indonesian + English sources) + English

## 1.1 Competing On

- Clean, sacred reading experience

- Deep study tools (themes, hadith linkage, cross-references, tafsir)

- Recognition-based vocabulary learning for non-Arabic speakers

- Mutashabihat awareness — critical for hifz accuracy

- Malaysian-first content and language

- Low operating cost

## 1.2 Not Competing On (Deferred)

- Habit gamification

- AI recitation coaching

- Social features

---

# 2. System Architecture

## 2.1 Delivery Layers

| Layer    | Description                                                    | Status        |
|--------------|--------------------------------------------------------------------|-------------------|
| Miftah Core  | Supabase PostgreSQL — 6 data layers, computed views, API           | Built (v2 schema) |
| Miftah Web   | Next.js PWA — primary study & memorization interface               | This document     |
| Miftah Bot   | Telegram bot — first product. Hifz, vocab, blanking, mutashabihat. | Phase 0.5         |
| Miftah Print | PDF generation — revision sheets, thematic collections             | Phase 6           |

## 2.2 Application Modes

| Mode | Purpose                                                      | Principle      |
|----------|------------------------------------------------------------------|--------------------|
| Read     | Clean tilawah. Mushaf rendering, audio, follow-along highlight.  | Sacred & clean     |
| Study    | Understanding. Themes, hadith, cross-refs, tafsir, vocab, SRS.   | Tools when invited |
| Hifz     | Memorization. Sabak-Manzil-Sabqi, blanking, chunks, audio, FSRS. | Deterministic      |

## 2.3 Hybrid Rendering Architecture

Decision: Arabic Quran text is pre-rendered as images at build time. The app displays images with transparent hitbox overlays for interactivity. All text data remains in Supabase for search, SRS, and analytics.

### Why Pre-Rendered

- Arabic web typography is the hardest technical challenge — ligatures, harakat, RTL vary across browsers

- Pre-rendering eliminates cross-platform inconsistencies — identical everywhere

- Works on Telegram, PWA, and native with zero platform-specific code

- KFGQPC font is build-time only — user’s browser never loads an Arabic font

### Two Reading Views

| View    | Description                                                               | Use Case                      |
|-------------|-------------------------------------------------------------------------------|-----------------------------------|
| Mushaf View | Exact Madinah page reproduction. 604 pages. Swipe. Pinch-to-zoom. Tap for BM. | Default. Tilawah. Spatial memory. |
| Ayah View   | One ayah full-width. BM below. Audio + word-by-word tap.                      | Study and hifz working view.      |

### Image Assets (Phase 0, Gate B)

| Asset                  | Count   | Est. Size | Purpose         |
|----------------------------|-------------|---------------|---------------------|
| Full Mushaf pages (retina) | 604         | ~90 MB        | Mushaf View         |
| Page thumbnails            | 604         | ~9 MB         | Instant placeholder |
| Per-ayah images (retina)   | 6,236       | ~150 MB       | Ayah View           |
| Per-word images            | ~77,000     | On-demand     | Study + flashcards  |
| Position manifests (JSON)  | 604 + 6,236 | ~5 MB         | Hitbox coordinates  |

### Interaction Model

- Transparent hitbox overlays positioned using manifest coordinates

- Tap hits invisible element → app looks up word metadata from Supabase

- Progressive blanking: opaque rectangles over word positions at runtime

- First-letter hints: cropped portion of word image

## 2.4 Database Layers (Built)

| \# | Layer    | Key Tables                                     | Purpose                        |
|--------|--------------|----------------------------------------------------|------------------------------------|
| 1      | Quranic Text | surahs, ayat, words, word_occurrences              | 114 surahs, 6,236 ayat, ~77K words |
| 2      | Thematic     | themes, asbab_nuzul                                | 6 categories + revelation contexts |
| 3      | Hadith       | hadith_sources, hadith_kitab, hadith, links        | Bukhari & Muslim                   |
| 4      | Progress     | study_progress, vocab_progress, review_log         | FSRS scheduling + event log        |
| 5      | Cross-Refs   | root_families, ayat_cross_references, tafsir_notes | Root families, relationships       |
| 6      | Mutashabihat | mutashabihat, mutashabihat_ayat                    | Similar phrases + positions        |

---

# 3. Key Architectural Decisions

## 3.1 Translation — AI-Resolved Malaysian BM

Use Indonesian (Kemenag) as primary source, English (Sahih International) as disambiguator. AI resolves into clean Malaysian Malay. One-time batch, stored statically, zero runtime cost.

### Batch Resolution Process

1.  Extract: for each of 6,236 ayat — Arabic text, Indonesian translation, English translation, surah/ayah reference.

2.  Resolve: AI prompt adapts Indonesian to Malaysian register using English as semantic check. Flags ambiguous ayat. Normalization map (~20–30 conventions: shalat→solat, Alquran→Al-Quran, insya Allah→insya-Allah, etc.) applied during resolution.

3.  Store: results saved to display_bm + bm_flagged boolean + bm_resolution_notes for audit trail.

4.  Review: human review of all flagged ayat (~100–300 expected). Spot-check 10 unflagged per juz.

5.  Correct: corrections made via review spreadsheet, applied back to database.

### Review & Correction Workflow (Detail)

After batch resolution, Khairul reviews using this structured process:

1.  Export resolved translations to spreadsheet (CSV/XLSX). Columns: surah, ayah, arabic_text, indonesian_source, english_source, display_bm, bm_flagged, bm_resolution_notes.

2.  Filter to bm_flagged=true first. Review each flagged ayah against both source translations.

3.  For corrections: edit display_bm directly. Add bm_correction_note explaining why (e.g., "‘seronok’ replaced with ‘kegembiraan’ — Indonesian connotation inappropriate in BM").

4.  For unflagged: spot-check 10 random per juz (30 × 10 = 300). Focus on longer translations where register drift is likely.

5.  High-risk subset: verify 20+ legal/hukum verses, 10+ aqidah-heavy verses, all false-cognate cases, repeated Quranic formulas.

6.  Import corrected spreadsheet back to Supabase. bm_correction_note becomes permanent audit trail.

7.  Keep original Indonesian and English untouched. Only display_bm changes.

### Translation Fields

- translation_id — raw Indonesian (preserved, never modified)

- translation_en — raw English (preserved)

- display_bm — AI-resolved Malaysian Malay (what user sees)

- bm_flagged — boolean: AI was uncertain

- bm_resolution_notes — what AI changed and why

- bm_correction_note — human reviewer’s corrections

## 3.2 Vocabulary — Recognition-First

Each word form learned as it appears. Root/lemma grouping after 3+ related forms known.

| Layer     | What                                                         | When       |
|---------------|------------------------------------------------------------------|----------------|
| Recognition   | Each form = one flashcard, one FSRS state. MCQ with distractors. | Default. MVP.  |
| Discovery     | Surface root connections after 3+ forms known.                   | Auto post-MVP. |
| Morphological | Pattern-based, lemma-grouped, Form I-X.                          | Opt-in. Later. |

## 3.3 Spaced Repetition — FSRS from Day One

**Start with FSRS. Do not implement SM-2. No migration path needed.**

Zero production users = zero migration cost. ts-fsrs library. Full schema in Section 5.3.

### Rationale

- FSRS is 20–30% more efficient than SM-2

- Zero users = zero migration cost

- Open-source: ts-fsrs (JS), py-fsrs (Python)

- review_log enables parameter optimization after 500+ events

## 3.4 Build Tool — Claude Code as Sole Builder

**Claude Code owns the entire build. No multi-tool coordination.**

CLAUDE.md in repo root is the primary context file for Claude Code sessions. It must contain: (1) project overview and current phase, (2) pointer to this build plan document, (3) tech stack summary, (4) repo directory structure, (5) naming conventions (file naming from Section 5.1.3), (6) database connection and migration conventions, (7) testing conventions, (8) git branch and commit conventions. Khairul is dispatcher and merge authority.

## 3.5 Hifz Scheduling — Sabak/Sabqi/Manzil Model

The Sabak-Sabqi-Manzil system is the traditional hifz methodology. Miftah implements it as follows:

### Definitions

| Term                | Definition                                                                                                 |
|-------------------------|----------------------------------------------------------------------------------------------------------------|
| Sabak (New Lesson)      | New portion being memorized today. Typically 1/2 to 1 page per session. Active learning block.                 |
| Sabqi (Recent Review)   | Portions memorized in last 7 days. Fresh material needing daily reinforcement. Reviewed every session.         |
| Manzil (Older Revision) | Everything memorized 7+ days ago. Divided into rotation cycle. Fixed daily portion so corpus cycles regularly. |

### Daily Session Structure

Each session has three blocks:

1.  Sabqi review: all ayat from last 7 days. Self-test via progressive blanking. Rate via FSRS.

2.  Sabak (new): memorize next portion. Blanking levels: full → last word hidden → more → blank. Audio loop. Mark done/struggled.

3.  Manzil review: today’s rotation portion. Pool divided so full corpus cycles in N days (total pages ÷ daily quota). Rate via FSRS.

### Parameters (configurable)

| Parameter      | Default                         | Notes                        |
|--------------------|-------------------------------------|----------------------------------|
| Sabak size         | 10 ayat or 1/2 page                 | User adjustable                  |
| Sabqi window       | 7 days                              | Ayat move to Manzil after 7 days |
| Daily Manzil quota | 2 pages                             | Determines cycle length          |
| Sabqi order        | Oldest first                        | Shakiest recent ayat first       |
| Manzil rotation    | Sequential by page within Juz order | Predictable                      |

### Interaction with FSRS

- FSRS governs ayah scheduling within each block. Easy-rated Sabqi ayat stay in Sabqi until 7-day window expires, but may be scheduled less frequently.

- In Manzil, FSRS determines if an ayah appears today. Low stability or overdue ayat prioritized.

- Sabak ayat enter FSRS when marked done (state=New, first review = next day).

- Manzil ayah rated Again moves back to Sabqi for re-review.

---

# 4. Technology Stack

| Component    | Choice                            | Rationale                          |
|------------------|---------------------------------------|----------------------------------------|
| Frontend         | Next.js + Tailwind CSS                | SSR, PWA, component-based              |
| Database         | Supabase (PostgreSQL)                 | Built (v2). REST API, auth, real-time. |
| Hosting          | Vercel                                | Native Next.js, free tier              |
| Arabic Rendering | Pre-rendered (Cairo + Pango + KFGQPC) | Pixel-perfect. Build-time only.        |
| Image Storage    | Supabase Storage or CDN               | ~250MB total                           |
| Audio            | Mishari Rashid via EveryAyah.com      | Free hosted, per-ayah                  |
| SRS Engine       | FSRS via ts-fsrs                      | 20-30% fewer reviews than SM-2         |
| Translation AI   | GPT-5.2 (one-time batch)              | ~2M tokens. Free via data sharing.     |
| Telegram Bot     | n8n + Telegram Bot API + Supabase     | Phase 0.5                              |
| Native Wrapper   | Capacitor (Phase 3+)                  | App store, native audio, push          |

---

# 5. Build Sequence

Phases organized by dependency and value delivery. Phase 0 split into two independent gates. Session numbers are approximate.

## 5.1 Phase 0 — Foundation (Gate Structure)

Two independent risk domains plus parallel infrastructure.

**Build tool: Claude Code owns all tasks.**

### 5.1.1 Parallel Infrastructure

| \# | Task                                                                                                                                                                                                                                                                                                                                                                                                            | Output        |
|--------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-------------------|
| C1     | Repo setup with directory structure: /src (Next.js app), /scripts/render (Cairo/Pango pipeline), /scripts/translate (batch resolution), /assets/pages (page PNGs + thumbnails), /assets/ayat (ayah PNGs), /assets/words (word PNGs), /assets/manifests (all JSON manifests), /test/golden (baseline golden page PNGs + manifests), /supabase/migrations (schema migrations). Plus CLAUDE.md, .gitignore, CI config. | Repo scaffold     |
| C2     | Supabase migration: FSRS fields, user_id, review_log, rendering_errors (schemas in 5.3)                                                                                                                                                                                                                                                                                                                             | Updated schema    |
| C3     | Next.js scaffold + Supabase client + Tailwind + Vercel deploy                                                                                                                                                                                                                                                                                                                                                       | Live skeleton app |

### 5.1.2 Gate A: Translation Pipeline

Produce production-ready BM translations for 6,236 ayat. See Section 3.1 for detailed workflow.

| \# | Task                                                                | Output            |
|--------|-------------------------------------------------------------------------|-----------------------|
| A1     | Write GPT-5.2 batch prompt with normalization map                       | Prompt + map          |
| A2     | Run batch: 6,236 ayat × (Arabic + ID + EN) → display_bm + flags + notes | Resolved translations |
| A3     | Export flagged ayat to review CSV (columns per Section 3.1)             | Review spreadsheet    |
| A4     | Khairul reviews flagged + spot-checks + high-risk subset                | Corrected spreadsheet |
| A5     | Import corrections to Supabase                                          | Production BM         |

**Gate A Pass Criteria:**

1.  All 6,236 ayat have non-null display_bm.

2.  All bm_flagged=true reviewed.

3.  300+ unflagged spot-checked.

4.  High-risk subset verified.

5.  Zero raw Indonesian remains.

*Gate A passes independently of Gate B.*

### 5.1.3 Gate B: Rendering Pipeline + Acceptance Spec

Single highest-risk dependency in the entire build.

### Tasks

| \# | Task                                                    | Output         |
|--------|-------------------------------------------------------------|--------------------|
| B1     | Set up Cairo + Pango + KFGQPC environment                   | Working render env |
| B2     | Render 5 golden test pages + ayah + word images + manifests | Golden test assets |
| B3     | Generate debug overlay images for all 5 golden pages        | Debug overlays     |
| B4     | Khairul verifies golden pages (checklist below)             | PASS/FAIL          |
| B5     | Full render: 604 pages + all assets                         | Complete asset set |
| B6     | Run completeness check script                               | PASS/FAIL          |
| B7     | Upload to Supabase Storage / CDN                            | Production images  |
| B8     | Tap test: 3+ golden pages on real mobile device             | PASS/FAIL          |

### Manifest Schema

Every manifest must conform to versioned schema. Validation failure = stop.

```json
{
  "page": int,
  "surah_start": int, "ayah_start": int,
  "surah_end": int, "ayah_end": int,
  "schema_version": "1.0.0",
  "image_width": int, "image_height": int, "dpi": 300,
  "words": [{
    "word_id": int, "surah": int, "ayah": int, "word_position": int,
    "x": float, "y": float, "width": float, "height": float
  }]
}
```

```json
{
  "surah": int, "ayah": int,
  "schema_version": "1.0.0",
  "image_width": int, "image_height": int,
  "words": [{
    "word_id": int, "word_position": int,
    "x": float, "y": float, "width": float, "height": float
  }]
}
```

- schema_version mandatory. Changes increment version. Consumers check before processing.

### Naming Contract

| Asset     | Pattern                      | Example                |
|---------------|----------------------------------|----------------------------|
| Mushaf page   | page_{NNN}.png                  | page_001.png               |
| Thumbnail     | page_{NNN}\_thumb.png           | page_001_thumb.png         |
| Page manifest | page_{NNN}.manifest.json        | page_001.manifest.json     |
| Ayah image    | ayah_{SSS}_{AAA}.png           | ayah_002_255.png           |
| Ayah manifest | ayah_{SSS}_{AAA}.manifest.json | ayah_002_255.manifest.json |
| Word image    | word_{WWWWW}.png                | word_00042.png             |

### Thumbnail Specification

- Resolution: 72 DPI (1/4 of full page)

- Dimensions: proportional downscale. 300 DPI page at 2480×3508px → thumbnail 620×877px.

- Format: PNG. File size: \<15KB each (~9MB total for 604).

- Purpose: spatial orientation, not reading. Text visible as shapes.

### Coordinate Tolerance

- Bounding box encloses 100% of visible ink including harakat

- Max overshoot: 8px any side at 300 DPI

- Adjacent hitboxes: max 2px overlap

- No zero dimensions. All coordinates non-negative.

Validation: debug overlay images. Khairul inspects desktop + mobile.

### Completeness

- 604 page PNGs + 604 thumbnails + 604 manifests = 1,812 files

- 6,236 ayah PNGs + 6,236 manifests = 12,472 files

- Word counts match Supabase. Zero orphans.

### Golden Test Pages

| Page | Content      | Why               | Validates      |
|----------|------------------|-----------------------|--------------------|
| 1        | Al-Fatihah       | Short ayat, bismillah | Basic rendering    |
| 2        | Al-Baqarah start | Dense, alif-lam-mim   | Ligatures, density |
| 77       | An-Nisa mid      | Long legal ayat       | Wrapping           |
| 489      | Ar-Rahman mid    | Repeated refrain      | Precision          |
| 604      | An-Nas           | Final page            | End handling       |

Per page: (1) visual match to Madinah reference, (2) hitbox on 5 words, (3) ayah images correct, (4) 3 word crops match, (5) manifest counts match.

### Regression

1.  Re-render 5 golden only

2.  Pixel diff \<0.5%

3.  Schema validation

4.  Failure = STOP

Baselines in /test/golden/.

### Fallback

- Web: missing manifest → image without hitboxes. Missing word → text fallback. Never crash.

- Bot: missing manifest → image only. Missing word → full ayah image.

- Errors logged to rendering_errors (schema in 5.3).

### Gate B Pass Criteria

1.  5 golden pages pass.

2.  Completeness PASS.

3.  Schema validation PASS.

4.  Overlays acceptable.

5.  3+ mobile tap tests pass.

**Fail = no bot, no web. Fix pipeline first.**

### 5.1.4 Downstream Unlock Rules

| Gate(s) Passed | Unlocked                                                                             |
|--------------------|------------------------------------------------------------------------------------------|
| Gate A only        | Translation review bot (T6). BM data for any UI.                                         |
| Gate B only        | Image-dependent bot: flashcards (T1), blanking (T5), mutashabihat (T4). Web scaffolding. |
| Gate A + Gate B    | Full Phase 0.5 bot. Phase 1 web reading with translations.                               |

## 5.2 Phase 0.5 — Telegram Bot: First Miftah Product

Validates FSRS, Sabak/Sabqi/Manzil (Section 3.5), and blanking through real daily use.

### Bot MVP (ship first)

- T1: Vocab flashcard — word image → answer → FSRS rating

- T2: Daily scheduler — morning hifz plan per Section 3.5

- T5: Progressive blanking — ayah → blanked self-test

- T7: /stats command

### Bot additions (after 2–3 weeks)

- T3: MCQ quiz

- T4: Mutashabihat alerts

- T6: Translation review

- T8: Ayah-of-the-day

Validation: assess FSRS intervals, daily load, blanking effectiveness. Fix before web.

## 5.3 Schema Specifications

Authoritative reference for Claude Code. All changes in single migration (C2).

### 5.3.1 study_progress (per-ayah)

| Field      | Type    | Default | Purpose                            |
|----------------|-------------|-------------|----------------------------------------|
| user_id        | uuid        | (FK)        | User isolation                         |
| ayah_id        | int         | (FK)        | Which ayah                             |
| stability      | float       | 0.0         | FSRS stability (days)                  |
| difficulty     | float       | 0.0         | FSRS difficulty (0–10)                 |
| elapsed_days   | int         | 0           | Days since last review                 |
| scheduled_days | int         | 0           | Days until next                        |
| reps           | int         | 0           | Total reviews                          |
| lapses         | int         | 0           | Times forgotten                        |
| state          | int         | 0           | 0=New 1=Learning 2=Review 3=Relearning |
| due            | timestamptz | now()       | Next due date                          |
| last_review    | timestamptz | null        | Last review                            |

### 5.3.2 vocab_progress

Identical FSRS fields, keyed on word_id.

### 5.3.3 review_log (new)

| Field      | Type    | Purpose                  |
|----------------|-------------|------------------------------|
| id             | uuid        | Primary key                  |
| user_id        | uuid        | FK to user                   |
| review_type    | text        | 'ayah' or 'vocab'            |
| item_id        | int         | ayah_id or word_id           |
| rating         | int         | 1=Again 2=Hard 3=Good 4=Easy |
| state_before   | int         | State before review          |
| state_after    | int         | State after review           |
| elapsed_days   | int         | Days since previous          |
| scheduled_days | int         | New interval                 |
| reviewed_at    | timestamptz | Timestamp                    |

### 5.3.4 rendering_errors (new)

Logs missing/invalid assets at runtime. Monitors pipeline health.

| Field  | Type    | Purpose                                                      |
|------------|-------------|------------------------------------------------------------------|
| id         | uuid        | Primary key                                                      |
| asset_type | text        | page_image, page_manifest, ayah_image, ayah_manifest, word_image |
| asset_id   | text        | Filename or identifier of missing asset                          |
| error_type | text        | missing, schema_invalid, corrupt, dimension_zero                 |
| consumer   | text        | 'web' or 'bot'                                                   |
| context    | text        | Page/surah/ayah where error occurred (nullable)                  |
| created_at | timestamptz | When error was logged                                            |

### 5.3.5 SM-2 Fields to Drop

- ease_factor → difficulty

- interval → scheduled_days + stability

- repetitions → reps

- quality → review_log.rating

- next_review → due

### 5.3.6 Implementation Notes

Library: ts-fsrs. Do not implement FSRS math from scratch.

Shared scheduler: ayah and vocab use same algorithm. Both log to review_log.

Rating: Telegram inline keyboard 4 buttons → FSRS 1–4.

Parameter optimization: deferred until 500+ events. Use defaults.

user_id: hardcoded UUID for single-user. RLS written now, activated with auth later.

## 5.4 Phase 1 — Core Reading

| \# | Feature                                                                                                                                                                                                                                                                                   | Notes         |
|--------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-------------------|
| 1      | Mushaf View: page images with swipe                                                                                                                                                                                                                                                           | 604 pages         |
| 2      | Pinch-to-zoom                                                                                                                                                                                                                                                                                 | Phone readability |
| 3      | Tap ayah → BM bottom sheet                                                                                                                                                                                                                                                                    | display_bm        |
| 4      | Ayah View: full-width + BM below                                                                                                                                                                                                                                                              | Scroll/swipe      |
| 5      | View toggle: Mushaf ↔ Ayah                                                                                                                                                                                                                                                                    | Remembers pref    |
| 6      | Surah/Juz/Page jump-to                                                                                                                                                                                                                                                                        |                   |
| 7      | Audio: play, loop, repeat, speed, highlight                                                                                                                                                                                                                                                   | Mishari CDN       |
| 8      | Word-by-word tap → BM meaning                                                                                                                                                                                                                                                                 | Manifests         |
| 9      | Continue reading + bookmarks                                                                                                                                                                                                                                                                  | Auto-save         |
| 10     | Read/Study/Hifz mode toggle                                                                                                                                                                                                                                                                   | Sacred default    |
| 11     | Offline Level 2: pre-cache page images, thumbnails, ayah images, and translations to IndexedDB/Cache API. Per-surah download button. Cache uses LRU eviction at 500MB budget. Stale assets invalidated by schema_version check against server. No progress sync (that is Level 3 in Phase 3). | Download button   |
| 12     | Lazy loading with thumbnails                                                                                                                                                                                                                                                                  | Slow connections  |
| 13     | Tests for reading components                                                                                                                                                                                                                                                                  | Parallel          |

## 5.5 Phase 2 — Thematic Study

| \# | Feature                               | Notes        |
|--------|-------------------------------------------|------------------|
| 14     | UI/UX session: Theme Explorer             |                  |
| 15     | Theme taxonomy (6 categories)             | Data exists      |
| 16     | Ayah ↔ Theme rendering                    | Passage-based    |
| 17     | Theme Explorer: search, filter, accordion |                  |
| 18     | Theme Detail page: Ayat tab               |                  |
| 19     | Surah Outline View                        | Theme blocks     |
| 20     | Theme Filter Mode                         | Regroup by theme |
| 21     | Theme Timeline Bar                        | Segmented bar    |

## 5.6 Phase 3 — Hifz Engine

Product fully delivers: read, understand, memorize. This is the real MVP.

| \# | Feature                      | Notes         |
|--------|----------------------------------|-------------------|
| 22     | UI/UX session: hifz wireframes   |                   |
| 23     | Sabak-Manzil-Sabqi scheduling    | Section 3.5       |
| 24     | Progressive blanking             | Self-test         |
| 25     | Chunk memorization: 3-5 ayah     | Master then chain |
| 26     | Audio loop: repeat N times       | Recite-along      |
| 27     | First-letter hint mode           | Memory prompt     |
| 28     | Mutashabihat flagging            | Killer feature    |
| 29     | Mutashabihat drill: side-by-side |                   |
| 30     | Per-ayah FSRS (schema ready)     | From Phase 0      |
| 31     | Hifz progress dashboard          | v_juz_progress    |

## 5.7 Phase 4 — Vocabulary Engine

| \# | Feature                    | Notes            |
|--------|--------------------------------|----------------------|
| 32     | Token normalization            | Strip diacritics     |
| 33     | Frequency ranking              |                      |
| 34     | Flashcard engine (FSRS)        | Schema ready         |
| 35     | MCQ: same POS distractors      |                      |
| 36     | Self-check quiz                |                      |
| 37     | Word count dashboard           | v_word_rank_coverage |
| 38     | Add-from-reading: tap → review |                      |

## 5.8 Phase 5 — Quran ↔ Sunnah Bridge

| \# | Feature                    | Notes    |
|--------|--------------------------------|--------------|
| 39     | Hadith display                 | Schema ready |
| 40     | Ayah ↔ Hadith labels           |              |
| 41     | Hadith tab in Theme Detail     |              |
| 42     | Hadith vault + discovery stats |              |
| 43     | Hadith data import (if needed) | Conditional  |

## 5.9 Phase 6 — Study Depth

| \# | Feature                 | Notes        |
|--------|-----------------------------|------------------|
| 44     | Cross-reference explorer    |                  |
| 45     | Root family discovery       | 3+ forms         |
| 46     | Asbab al-nuzul per ayah     |                  |
| 47     | Tafsir notes (multi-source) |                  |
| 48     | Personal notes per ayah     |                  |
| 49     | Word-audio sync             | If data supports |

## 5.10 Phase 7 — Expansion

- Miftah Print (PDF)

- Multi-user auth (user_id ready)

- Advanced vocabulary: morphological (opt-in)

- Habit tracking

- AI study tools (when revenue justifies)

- AI recitation feedback (when revenue justifies)

---

# 6. Resolved Decisions

## 6.1 Foundation

| \# | Decision           | Resolution                          |
|--------|------------------------|-----------------------------------------|
| D1     | Indonesian translation | Kemenag                                 |
| D2     | English translation    | Sahih International                     |
| D3     | Hadith data            | Loaded (Bukhari & Muslim)               |
| D4     | Audio                  | Mishari Rashid via EveryAyah.com        |
| D5     | Launch                 | Personal → trusted testers → small beta |

## 6.2 Technical

| \# | Decision      | Resolution                         |
|--------|-------------------|----------------------------------------|
| D6     | Arabic rendering  | Pre-rendered images + hitbox overlays  |
| D7     | Responsive        | Mobile-first                           |
| D8     | Reading views     | Mushaf (default) + Ayah. Toggle.       |
| D9     | Themes            | 6-category + cross-surah index Phase 2 |
| D10    | MCQ distractors   | Precomputed. Same POS, freq, theme.    |
| D11    | Word family       | Auto at 3+ forms                       |
| D12    | Offline           | Level 2 Phase 1, Level 3 Phase 3       |
| D13    | Spaced repetition | FSRS from day one. ts-fsrs.            |
| D14    | Build tool        | Claude Code sole builder.              |

---

# 7. Strategic Rules

- Launch fastest with Telegram bot. Validates core before web.

- Themes foundation for hifz. Phase 2 understanding makes Phase 3 stick.

- Hifz is core promise. Phase 3 = read + understand + memorize.

- Four engagement loops by Phase 4.

- Recognition before analysis.

- Root discovery is reward, not prerequisite.

- Mutashabihat is killer feature.

- AI is build tool, not product feature.

- One translation line. Clean BM.

- Reading stays sacred.

- Ship, then depth.

- No bot until Gate B. No web until both gates.

- FSRS from day one.

---

# 8. Document History

| Version | Date   | Changes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
|-------------|------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| 1.5         | March 2026 | Merged pre-build contracts (Rendering Spec, FSRS ADR, Gate Split). Claude Code sole builder. Sabak/Sabqi/Manzil scheduling defined with FSRS interaction rules. Thumbnail spec (72 DPI, 620x877px). rendering_errors schema. Translation review workflow restored with 7-step detail. Session numbers renumbered 1-49 sequentially. SM-2 replaced with FSRS throughout. Manifest schemas fully typed. Offline Level 2 specified. Repo directory structure defined. CLAUDE.md outline added. |
| 1.4         | March 2026 | Telegram bot as Phase 0.5. T1-T8 features. Validates FSRS and Sabak logic before web.                                                                                                                                                                                                                                                                                                                                                                                                       |
