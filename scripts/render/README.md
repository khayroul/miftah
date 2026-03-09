# Rendering Pipeline (Gate B)

Cairo + Pango + KFGQPC pipeline for pre-rendering Arabic Quran text.

## Exact Quran.com iOS Mode (Recommended)
For pixel-exact page visuals that match Quran.com iOS (hafs_1405), import
official pre-rendered page PNGs + hitboxes:

```bash
npm run render:import-official -- --pages 1-604
```

The importer expects Quran.com iOS resources at:
`/tmp/quran-ios/Example/QuranEngineApp/Resources/hafs_1405`

Override source path if needed:

```bash
python3 scripts/render/import_official_pages.py \
  --source-root /path/to/hafs_1405 \
  --pages 586,589
```

## Pixel Parity Check (Gate B Regression)
Validate `assets/pages/page_{NNN}.png` against official Quran.com iOS source
images with an explicit per-page mismatch threshold.

Default threshold is `0.5%` (BUILD_PLAN regression criterion).

```bash
npm run render:check-ios-parity -- --pages 1,2,77,489,604
```

Strict exact mode (`0.0%` mismatch):

```bash
npm run render:check-ios-parity -- --pages 586,589 --threshold 0
```

Outputs:
- JSON report: `test/reports/ios_parity_report.json`
- Diff overlays for failing pages: `test/diffs/ios_parity/`

## Extract Ayah + Word Assets From Official Pages
Generate per-ayah strips and per-word crops from official iOS pages using
`ayahinfo_1920.db` glyph boxes:

```bash
npm run render:extract-official-subassets -- --pages 1-604
```

Then run completeness check against DB-derived expected counts:

```bash
npm run render:check-official-completeness -- --pages 1-604
```

Outputs:
- `assets/ayat/ayah_{SSS}_{AAA}.png`
- `assets/manifests/ayah_{SSS}_{AAA}.manifest.json`
- `assets/words/word_{WWWWW}.png`
- report: `test/reports/official_completeness_report.json`

## Mobile Tap QA Harness
Run iPhone-emulated tap checks for `/read/[page]`:

```bash
# Terminal 1
npm run dev

# Terminal 2
npm run qa:mobile-tap -- --base-url http://127.0.0.1:3000 --pages 1,77,586,604
```

Outputs:
- screenshots + JSON report: `test/reports/mobile_tap_qa/`

## Outputs
- `/assets/pages/` — 604 Mushaf page PNGs + thumbnails
- `/assets/ayat/` — 6,236 per-ayah PNGs
- `/assets/words/` — ~77,000 per-word PNGs
- `/assets/manifests/` — Hitbox coordinate JSON manifests

## Golden Test Pages
Pages 1, 2, 77, 489, 604 — rendered first for validation.

## Dependencies
- Cairo + Pango (system)
- KFGQPC Hafs font
- Python (pycairo, pangocffi)

See BUILD_PLAN.md Section 5.1.3 for full spec.
