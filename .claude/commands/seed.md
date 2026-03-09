---
description: Run database seeding for Miftah (Supabase).
---

# Seed Database

1. Check current state: count rows in key tables (surahs, ayahs, words, juz_metadata)
2. If user specifies what to seed, run the appropriate script:
   - Full seed: `psql` or Supabase SQL editor with `data/seed/seed.sql`
   - Ayah themes: `npm run seed:fetch-ayah-themes`
   - Translations: check `scripts/translate/`
3. Verify seeding by querying counts after
4. Report: tables affected, rows inserted, any errors
