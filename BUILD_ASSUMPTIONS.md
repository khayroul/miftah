# Build Assumptions Log

Updated: 2026-03-10

## Active Assumptions

1. Continue-reading and bookmark state can be implemented as local-first persistence (`localStorage`) for now, without blocking on new Supabase tables.
2. If Supabase navigation mapping is unavailable at runtime, read navigation may fall back to local seed files (`data/seed/*.json`) to keep `/read` functional.
3. Jump-to behavior should prioritize safe constraints over permissive parsing (numeric-only input; strict ranges).
4. Continue-reading pointer is page-level only (not per mode, per surah, or per device).
5. Bookmark identity is page-level only in Phase 1 (no labels/tags yet).
6. Reading utilities (jump/bookmarks/continue) can be visible but compact on `/read/[page]`, prioritizing sacred reading view while keeping tools one-tap away.
7. Progressive loading uses page thumbnails as immediate visual placeholders; word hitboxes stay disabled until full-resolution page image is ready.
8. Read mode keeps word-level interactivity off; Study/Hifz modes enable interactive tools and audio controls.
9. Audio highlighting in this phase is ayah-level context within the control panel (`Now playing surah:ayah`), not yet on-page visual highlighting of glyph regions.
10. If `ayat.audio_url` is missing, web audio falls back to generated EveryAyah links (`https://everyayah.com/data/Alafasy_128kbps/{surah3}{ayah3}.mp3`).

## Review Needed Later

- Whether bookmarks and continue-reading should become server-synced in Supabase.
- Whether strict numeric input should accept wider formats (e.g., `2:255` for ayah-jump).
- Whether page-only bookmarks are sufficient or need ayah-level granularity.
