# Rendering Pipeline (Gate B)

Cairo + Pango + KFGQPC pipeline for pre-rendering Arabic Quran text.

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
