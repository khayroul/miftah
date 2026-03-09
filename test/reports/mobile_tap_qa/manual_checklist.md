# Mobile Tap QA Checklist (Real Device)

Date: 2026-03-09
Build: local `/read/[page]` with official iOS page assets

## Scope
- Minimum 3 pages:
  - Page 1
  - Page 586
  - Page 604

## Steps Per Page
1. Open `/read/{page}` on a real phone browser.
2. Tap one visible word.
3. Verify highlighted word box appears.
4. Verify tooltip appears with:
   - BM translation
   - EN translation
   - location (surah:ayah:word)
5. Tap the same word again.
6. Verify tooltip dismisses.
7. Repeat for at least 3 words on the page.

## Pass Criteria
- No crash or freeze.
- Tooltip appears/dismisses reliably.
- Word hitbox aligns to tapped text.
- Translations are non-empty for sampled words.

## Automated Emulation Evidence
- `test/reports/mobile_tap_qa/report.json` (Playwright iPhone emulation)
- Screenshots in `test/reports/mobile_tap_qa/`
