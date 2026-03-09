# Miftah Dataset Expansion (2026-03-09)

## 1) New data now added from QUL mini dump

Implemented in seed pipeline:
- `themes` + `theme_ayat`
- `mutashabihat` + `mutashabihat_ayat`
- `tafsir_notes` (from QUL `tafsirs`)

Current extracted counts:
- themes: `1261`
- theme_ayat: `8512`
- mutashabihat: `300`
- mutashabihat_ayat: `810`
- tafsir_notes: `3836`
  - `English Al-Mukhtasar`: `1919`
  - `Tafsir Ibn Kathir` (Arabic): `1917`

## 2) Other high-value QUL data you can ingest next (already in local dump)

Observed populated tables in `mini_quran_dev.sql`:
- `tafsirs`: `149475` rows
- `foot_notes`: `35062` rows
- `chapter_infos`: `114` rows
- `translations`: `409643` rows
- `word_translations`: `246459` rows

Best immediate expansion (no external dependency):
1. Expand `tafsir_notes` resource set (more EN/BM-friendly tafsir resources).
2. Add `foot_notes` ingestion for translation context notes.
3. Add `chapter_infos` ingestion (surah-level context; may require a new table since current schema is ayah-level for `asbab_nuzul`).

## 3) Sahih hadith dataset options

### A. Sunnah.com official API (recommended primary source)
Use for `hadith_sources`, `hadith_kitab`, `hadith`.

Pros:
- Official hadith platform API.
- Structured endpoints for collections/books/chapters/hadith.
- Includes hadith grades in API schema.

Constraints:
- Requires API access request and API key (`x-api-key`).
- Offline dump is not currently available per their developer page.

Sources:
- https://sunnah.com/developers
- https://raw.githubusercontent.com/sunnah-com/api/master/spec.v1.yml

### B. HadeethEnc API / downloads (secondary source)
Useful for multilingual hadith enrichment if needed.

Pros:
- Large multilingual hadith corpus.
- API and downloadable datasets are published.

Constraints:
- Must verify and comply with their terms/policies before production ingestion.
- Data model may need extra normalization before mapping into your hadith schema.

Sources:
- https://hadeethenc.com/en
- https://github.com/IslamHouse-API

### C. Community mirrors (dev-only fallback)
Examples exist (e.g. community JSON APIs/dumps) but many are scraped or licensing is unclear.

Recommendation:
- Do not use as production source unless legal/licensing is explicitly confirmed.

## 4) Recommended rollout order

1. **Now**: keep QUL-based expansion (already implemented) and seed into Supabase.
2. **Next**: integrate more QUL tafsir/footnotes and expose read APIs in app/bot.
3. **Then**: add Sunnah.com API ingestion for Sahih collections (start with Bukhari + Muslim).
4. **After**: build `hadith_ayat_links` curation workflow (manual + heuristic tagging) since reliable ayah-hadith linking is not automatic.

## 5) Practical dependencies for Sahih hadith

Required before coding production ingest:
- Sunnah API key from developer access flow.
- Final source policy decision (Sunnah-only vs Sunnah + HadeethEnc augmentation).
- Decision on translation strategy for BM (`text_bm`):
  - leave NULL initially,
  - use approved BM source,
  - or controlled EN->BM pipeline with review.
