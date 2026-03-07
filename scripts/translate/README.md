# Translation Pipeline (Gate A)

Batch resolution of Malaysian BM translations from Indonesian + English sources.

## Process
1. Extract 6,236 ayat (Arabic + Indonesian + English) from Supabase
2. GPT-5.2 resolves into Malaysian Malay with normalization map
3. Results → display_bm + bm_flagged + bm_resolution_notes
4. Export flagged ayat to review CSV
5. Khairul reviews flagged + spot-checks
6. Import corrections back to Supabase

## Key Fields
- `translation_id` — raw Indonesian (Kemenag, never modified)
- `translation_en` — raw English (Sahih International, never modified)
- `display_bm` — AI-resolved Malaysian Malay (what user sees)

See BUILD_PLAN.md Section 3.1 for full spec.
