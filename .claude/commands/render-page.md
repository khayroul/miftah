---
description: Render a specific mushaf page using the Playwright browser renderer.
---

# Render Page

1. Ask which page number(s) to render (1-604), or use the one specified
2. Verify the page font exists: `assets/fonts/qcf-v2/QCF2_P{NNN}.TTF`
3. Verify the page layout data exists: `data/mushaf-layout/mushaf/page-{NNN}.json`
4. Run the browser renderer:
   ```bash
   cd ~/miftah && node scripts/render/render_browser.mjs {page_number}
   ```
5. Check output in `assets/pages/page_{NNN}.png`
6. Compare against golden reference if available: `test/golden/page_{NNN}.png`
7. Report: rendered successfully, file size, any warnings

**Known issues to watch for:**
- Basmala lines may show garbled text (QPC2BSML font issue)
- Pages with surah transitions may miss headers (line count heuristic bug)
