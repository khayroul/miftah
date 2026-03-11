#!/usr/bin/env node
/**
 * Miftah — Browser-based QCF V2 Mushaf Renderer
 *
 * Uses Playwright (headless Chromium) to render Quran pages with QCF V2 fonts.
 * This is the same rendering approach quran.com uses — browsers handle QCF
 * pre-shaped PUA glyphs correctly without any HarfBuzz interference.
 *
 * Usage:
 *   node render_browser.mjs --page 6
 *   node render_browser.mjs --pages 1-604
 *   node render_browser.mjs --golden-only
 */

import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
// XML parsing done with regex (no xml2js dependency needed)

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..');
const DATA_DIR = join(PROJECT_ROOT, 'data');
const ASSETS_DIR = join(PROJECT_ROOT, 'assets');
const FONT_DIR = join(ASSETS_DIR, 'fonts', 'qcf-v2');
const WOFF2_DIR = join(ASSETS_DIR, 'fonts', 'qcf-v2-woff2');
const SURAH_NAMES_FONT = join(ASSETS_DIR, 'fonts', 'surah-names', 'sura_names.woff2');
const SURAH_FRAME_REFERENCE = join(ASSETS_DIR, 'surah-frame-reference.png');
const SURAH_FRAME_SVG = join(ASSETS_DIR, 'surah-frame.svg');
const BASMALA_FONT = join(FONT_DIR, 'QCF_BSML.TTF');
const TEST_DIR = join(PROJECT_ROOT, 'test');
const BASMALA_GLYPHS_QPC2 = 'ﭑﭒﭓ';

// Page dimensions — mobile-first (portrait phone)
const PAGE_WIDTH = 768;
const PAGE_HEIGHT = 1280;

// Theme presets — easily extensible for paper color / font color changes
const THEMES = {
  light: {
    pageBg: '#f5f4f0',
    textColor: '#1b1b1b',
    headerColor: '#555',
    surahArColor: '#333',
    bannerBg: '#efede8',
    bannerBorder: '#c8c3b9',
    bannerText: '#3d3525',
    borderColor: '#dddcd8',
    pageNumColor: '#888',
  },
  dark: {
    pageBg: '#1a1a1a',
    textColor: '#e8e4df',
    headerColor: '#999',
    surahArColor: '#ccc',
    bannerBg: '#2a2a2a',
    bannerBorder: '#444',
    bannerText: '#c8c3b9',
    borderColor: '#333',
    pageNumColor: '#666',
  },
  paper: {
    // Clean white — matches reference mushaf app light mode
    pageBg: '#ffffff',
    textColor: '#1a1a1a',
    headerColor: '#666',
    surahArColor: '#333',
    bannerBg: '#f5f5f5',
    bannerBorder: '#d0d0d0',
    bannerText: '#333',
    borderColor: '#e0e0e0',
    pageNumColor: '#999',
  },
  sepia: {
    // Warm parchment / old paper feel
    pageBg: '#f4e8d1',
    textColor: '#2c1e0e',
    headerColor: '#6b5a47',
    surahArColor: '#3d2e1a',
    bannerBg: '#efe0c8',
    bannerBorder: '#c8b090',
    bannerText: '#3d2e1a',
    borderColor: '#d4c4a8',
    pageNumColor: '#8a7a64',
  },
  night: {
    // Deep navy — easy on eyes at night
    pageBg: '#0d1b2a',
    textColor: '#c8d6e5',
    headerColor: '#6b8299',
    surahArColor: '#a0b8d0',
    bannerBg: '#152238',
    bannerBorder: '#2a3f5f',
    bannerText: '#8fa8c8',
    borderColor: '#1b2d44',
    pageNumColor: '#4a6580',
  },
};

// Juz boundaries
const JUZ_START_PAGES = [
  1, 22, 42, 62, 82, 102, 121, 142, 162, 182,
  201, 222, 242, 262, 282, 302, 322, 342, 362, 382,
  402, 422, 442, 462, 482, 502, 522, 542, 562, 582
];

function getJuz(page) {
  for (let i = JUZ_START_PAGES.length - 1; i >= 0; i--) {
    if (page >= JUZ_START_PAGES[i]) return i + 1;
  }
  return 1;
}

// Load surah metadata from XML
function loadSurahMeta() {
  const xmlPath = join(DATA_DIR, 'qul', 'quran-data.xml');
  if (!existsSync(xmlPath)) return {};

  const xml = readFileSync(xmlPath, 'utf-8');
  const surahs = {};

  // Simple regex-based XML parsing (avoid xml2js dependency)
  const matches = xml.matchAll(/<sura\s+([^>]+)\/>/g);
  for (const m of matches) {
    const attrs = m[1];
    const idx = attrs.match(/index="(\d+)"/)?.[1];
    const name = attrs.match(/name="([^"]+)"/)?.[1];
    const tname = attrs.match(/tname="([^"]+)"/)?.[1];
    const ayas = attrs.match(/ayas="(\d+)"/)?.[1];
    if (idx) {
      surahs[parseInt(idx)] = {
        name_ar: name || '',
        name_en: tname || '',
        ayas: parseInt(ayas || '0'),
      };
    }
  }
  return surahs;
}

// Load mushaf layout for one page
function loadLayout(pageNum) {
  const p = join(DATA_DIR, 'mushaf-layout', 'mushaf', `page-${String(pageNum).padStart(3, '0')}.json`);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, 'utf-8'));
}

// Get surahs present on a page
function getPageSurahs(layout) {
  const surahs = new Set();
  for (const line of layout.lines || []) {
    if (line.type === 'surah-header') surahs.add(parseInt(line.surah || '0'));
    if (line.type === 'text' && line.verseRange) {
      for (const part of line.verseRange.split('-')) {
        if (part.includes(':')) surahs.add(parseInt(part.split(':')[0]));
      }
    }
  }
  return [...surahs].sort((a, b) => a - b);
}

function parseVerseRef(ref) {
  if (typeof ref !== 'string' || !ref.includes(':')) return null;
  const [surah, ayah] = ref.split(':').map(Number);
  if (!Number.isFinite(surah) || !Number.isFinite(ayah)) return null;
  return { surah, ayah };
}

function getPageStartSurah(layout) {
  for (const line of layout.lines || []) {
    if (line.type === 'surah-header' && line.surah) {
      const surah = parseInt(line.surah, 10);
      if (Number.isFinite(surah)) return surah;
    }
    if (line.type === 'text' && line.verseRange) {
      const startRef = line.verseRange.split('-')[0];
      const parsed = parseVerseRef(startRef);
      if (parsed) return parsed.surah;
    }
  }
  return null;
}

function getPageEndVerse(layout) {
  const lines = layout?.lines || [];
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (line.type !== 'text' || !line.verseRange) continue;
    const parts = line.verseRange.split('-');
    const endRef = parts[parts.length - 1];
    const parsed = parseVerseRef(endRef);
    if (parsed) return parsed;
  }
  return null;
}

function getTrailingSurah(layout, surahMeta) {
  if (!layout || !Array.isArray(layout.lines)) return null;
  if (layout.lines.length >= 15) return null;

  const endVerse = getPageEndVerse(layout);
  if (!endVerse) return null;

  const ayahCount = surahMeta[endVerse.surah]?.ayas;
  if (!Number.isFinite(ayahCount) || endVerse.ayah !== ayahCount) return null;

  const nextSurah = endVerse.surah + 1;
  if (!surahMeta[nextSurah]) return null;

  const alreadyOnPage = layout.lines.some(line =>
    line.type === 'surah-header' && parseInt(line.surah || '0', 10) === nextSurah
  );
  return alreadyOnPage ? null : nextSurah;
}

function normalizeLayoutForRender(layout, surahMeta) {
  if (!layout || !Array.isArray(layout.lines)) return layout;
  const lines = layout.lines.map(line => ({ ...line }));

  const hasSurahHeader = lines.some(line => line.type === 'surah-header');
  const hasBasmala = lines.some(line => line.type === 'basmala');
  const firstTextLine = lines.find(
    line => line.type === 'text' && typeof line.verseRange === 'string',
  );

  if (!firstTextLine) {
    return { ...layout, lines };
  }

  const startRef = firstTextLine.verseRange.split('-')[0];
  const startVerse = parseVerseRef(startRef);

  // Dataset fallback: pages 586/590 ship with only text lines despite surah start.
  if (
    startVerse &&
    startVerse.ayah === 1 &&
    !hasSurahHeader &&
    !hasBasmala &&
    lines.length <= 12
  ) {
    const prefix = [
      {
        type: 'surah-header',
        text: surahMeta[startVerse.surah]?.name_ar || '',
        surah: String(startVerse.surah).padStart(3, '0'),
      },
    ];
    if (startVerse.surah !== 1 && startVerse.surah !== 9) {
      prefix.push({
        type: 'basmala',
        qpcV2: BASMALA_GLYPHS_QPC2,
        qpcV1: '#"!',
      });
    }
    return { ...layout, lines: [...prefix, ...lines] };
  }

  return { ...layout, lines };
}

// Find the WOFF2 font path for a page
function getWoff2Path(pageNum) {
  // Try both naming conventions
  const candidates = [
    join(WOFF2_DIR, `p${pageNum}.woff2`),
    join(WOFF2_DIR, `p${String(pageNum).padStart(3, '0')}.woff2`),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

// Build the HTML for one page
function buildPageHTML(pageNum, layout, surahMeta, theme = 'light') {
  const normalizedLayout = normalizeLayoutForRender(layout, surahMeta);
  const t = THEMES[theme] || THEMES.light;
  const juz = getJuz(pageNum);
  const pageSurahs = getPageSurahs(normalizedLayout);
    // getPageStartSurah(normalizedLayout) || pageSurahs[0] || 1;
  // const sm = surahMeta[primarySurah] || {};

  // Read font file as base64 for embedding
  const woff2Path = getWoff2Path(pageNum);
  const ttfPath = join(FONT_DIR, `QCF2_P${String(pageNum).padStart(3, '0')}.TTF`);

  let fontSrc = '';
  if (woff2Path) {
    const fontData = readFileSync(woff2Path).toString('base64');
    fontSrc = `url(data:font/woff2;base64,${fontData}) format('woff2')`;
  } else if (existsSync(ttfPath)) {
    const fontData = readFileSync(ttfPath).toString('base64');
    fontSrc = `url(data:font/truetype;base64,${fontData}) format('truetype')`;
  } else {
    throw new Error(`No font found for page ${pageNum}`);
  }

  const fontFamily = `QCF2_P${String(pageNum).padStart(3, '0')}`;
  const hasBasmalaFont = existsSync(BASMALA_FONT);
  const basmalaFontFamily = hasBasmalaFont ? 'QCF2_BSML' : fontFamily;

  // Embed surah names font (ornamental frame with calligraphic surah name)
  let surahNamesFontSrc = '';
  if (existsSync(SURAH_NAMES_FONT)) {
    const snData = readFileSync(SURAH_NAMES_FONT).toString('base64');
    surahNamesFontSrc = `url(data:font/woff2;base64,${snData}) format('woff2')`;
  }

  let surahFrameBg = '';
  if (existsSync(SURAH_FRAME_REFERENCE)) {
    const frameData = readFileSync(SURAH_FRAME_REFERENCE).toString('base64');
    surahFrameBg = `url(data:image/png;base64,${frameData})`;
  } else if (existsSync(SURAH_FRAME_SVG)) {
    const frameData = readFileSync(SURAH_FRAME_SVG).toString('base64');
    surahFrameBg = `url(data:image/svg+xml;base64,${frameData})`;
  }

  let basmalaFontSrc = '';
  if (hasBasmalaFont) {
    const bsmlData = readFileSync(BASMALA_FONT).toString('base64');
    basmalaFontSrc = `url(data:font/truetype;base64,${bsmlData}) format('truetype')`;
  }

  // Count total line elements for spacing logic
  const lineCount = (normalizedLayout.lines || []).length;
  const isOpeningPage = (pageNum === 1 || pageNum === 2); // Special circular layout
  const isShortPage = !isOpeningPage && lineCount < 15;
  const trailingSurah = getTrailingSurah(normalizedLayout, surahMeta);

  // Pre-scan: identify "last lines" of each surah — these should NOT be
  // fully justified (space-between). A text line is a "last line" if:
  //   (a) the next non-text element is a surah-header, OR
  //   (b) it's the final text line on the page and the surah ends here
  const allLines = normalizedLayout.lines || [];
  const lastLineIndexes = new Set();
  for (let i = 0; i < allLines.length; i++) {
    if (allLines[i].type !== 'text') continue;
    // Look ahead: is this the last text line before a surah-header or end-of-page?
    let isLastLine = false;
    // Check if next structured element is surah-header
    for (let j = i + 1; j < allLines.length; j++) {
      if (allLines[j].type === 'text') break; // another text line follows — not last
      if (allLines[j].type === 'surah-header') { isLastLine = true; break; }
    }
    // Also check if this is the very last text line on the page
    if (!isLastLine) {
      const hasMoreText = allLines.slice(i + 1).some(l => l.type === 'text');
      if (!hasMoreText) isLastLine = true;
    }
    // Only apply natural spacing to short last lines (≤5 words).
    // Longer last lines (6+ words) still look good justified.
    const wordCount = (allLines[i].words || []).length;
    if (isLastLine && wordCount <= 5) lastLineIndexes.add(i);
  }

  // Build line HTML
  const linesHTML = [];
  for (let i = 0; i < allLines.length; i++) {
    const line = allLines[i];
    if (line.type === 'surah-header') {
      const sn = parseInt(line.surah || '0');
      const name = surahMeta[sn]?.name_ar || `سورة ${sn}`;
      linesHTML.push(`<div class="surah-banner"><div class="surah-frame"><span class="surah-title">${name}</span></div></div>`);
    } else if (line.type === 'basmala') {
      const qpc = line.qpcV2 || '';
      linesHTML.push(`<div class="basmala"><span class="qcf">${qpc}</span></div>`);
    } else if (line.type === 'text') {
      const isLast = lastLineIndexes.has(i);
      const words = (line.words || []).map(w => {
        const g = w.qpcV2 || '';
        const loc = w.location || '';
        const wordStr = w.word || '';
        const safeG = g.replace(/ /g, '\u00A0'); // non-breaking space
        
        const hasHizb = wordStr.includes('۞');
        const hasSajdah = wordStr.includes('۩');
        const hasAyahNum = /[٠-٩]+$/.test(wordStr);
        
        const chars = Array.from(safeG);
        let leftIdx = 0;
        let rightIdx = chars.length - 1;
        
        let signsPrefix = '';
        if (hasHizb && chars.length > 0) {
          signsPrefix += `<span class="sign">${chars[leftIdx]}</span>`;
          leftIdx++;
          while (leftIdx <= rightIdx && chars[leftIdx] === '\u00A0') {
            signsPrefix += `<span class="sign">${chars[leftIdx]}</span>`;
            leftIdx++;
          }
        }
        
        let signsSuffix = '';
        let trailingSignsCount = 0;
        if (hasAyahNum) trailingSignsCount++;
        if (hasSajdah) trailingSignsCount++;
        
        while (trailingSignsCount > 0 && rightIdx >= leftIdx) {
          if (chars[rightIdx] === '\u00A0') {
            signsSuffix = `<span class="sign">${chars[rightIdx]}</span>` + signsSuffix;
            rightIdx--;
          } else {
            signsSuffix = `<span class="sign">${chars[rightIdx]}</span>` + signsSuffix;
            rightIdx--;
            trailingSignsCount--;
          }
        }
        
        // Exclude trailing padding from the hitbox
        while (rightIdx >= leftIdx && chars[rightIdx] === '\u00A0') {
          signsSuffix = `<span class="sign">${chars[rightIdx]}</span>` + signsSuffix;
          rightIdx--;
        }

        const wordChars = chars.slice(leftIdx, rightIdx + 1).join('');
        const wordHtml = wordChars.length > 0 ? `<span class="word" data-loc="${loc}">${wordChars}</span>` : '';
        
        return `<span class="word-group">${signsPrefix}${wordHtml}${signsSuffix}</span>`;
      });
      // Last line of surah: natural spacing (not stretched); others: justified
      const cls = isLast ? 'text-line last-line' : 'text-line';
      linesHTML.push(`<div class="${cls}">${words.join(' ')}</div>`);
    }
  }

  const trailingBannerHTML = trailingSurah
    ? `<div class="surah-banner trailing"><div class="surah-frame"><span class="surah-title">${surahMeta[trailingSurah]?.name_ar || `سورة ${trailingSurah}`}</span></div></div>`
    : '';

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="utf-8">
<style>
  @font-face {
    font-family: '${fontFamily}';
    src: ${fontSrc};
    font-weight: normal;
    font-style: normal;
    font-display: block;
  }
  ${surahNamesFontSrc ? `
  @font-face {
    font-family: 'surah_names';
    src: ${surahNamesFontSrc};
    font-weight: normal;
    font-style: normal;
    font-display: block;
  }` : ''}
  ${basmalaFontSrc ? `
  @font-face {
    font-family: 'QCF2_BSML';
    src: ${basmalaFontSrc};
    font-weight: normal;
    font-style: normal;
    font-display: block;
  }` : ''}

  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    width: ${PAGE_WIDTH}px;
    height: ${PAGE_HEIGHT}px;
    background: ${t.pageBg};
    overflow: hidden;
    font-family: sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  .page {
    width: ${PAGE_WIDTH}px;
    height: ${PAGE_HEIGHT}px;
    display: flex;
    flex-direction: column;
    position: relative;
  }

  /* Header bar */
  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    padding: 16px 18px 10px;
    border-bottom: 1px solid ${t.borderColor};
    direction: ltr;
  }
  .header .juz {
    font-size: 17px;
    color: ${t.headerColor};
    font-family: -apple-system, 'Helvetica Neue', sans-serif;
    font-weight: 400;
    white-space: nowrap;
  }
  .header .surah-name {
    font-size: 15px;
    color: ${t.headerColor};
    font-family: -apple-system, 'Helvetica Neue', sans-serif;
    flex: 1 1 auto;
    min-width: 0;
    direction: rtl;
    text-align: right;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-weight: 400;
  }
  .header .surah-ar {
    font-family: 'Geeza Pro', 'Traditional Arabic', serif;
    font-size: 20px;
    color: ${t.surahArColor};
    font-weight: 700;
  }

  /* Text area — fills the page between header and page number */
  .text-area {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 16px 26px 0;
  }

  /* Short pages (<15 elements): use fixed gap matching 15-line spacing, content at top */
  .text-area.short-page {
    justify-content: flex-start;
    gap: 36px;
  }

  /* Opening pages (1-2): circular/oval text arrangement — centered, larger font */
  .text-area.opening-page {
    justify-content: center;
    gap: 28px;
    padding: 0 60px;
  }
  .opening-page .text-line {
    justify-content: center;
    gap: 12px;
    font-size: 54px;
  }
  .opening-page .basmala {
    font-size: 54px;
  }
  .opening-page .surah-banner .surah-title {
    font-size: 56px;
  }

  /* Each text line — flexbox RTL with space-between for mushaf justification */
  .text-line {
    direction: rtl;
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    font-family: '${fontFamily}', serif;
    font-size: 37.2px;
    line-height: 1.0;
    color: ${t.textColor};
    padding: 0 2px;
    font-weight: 400;
  }

  /* Last line of a surah — natural word spacing, not stretched edge-to-edge */
  .text-line.last-line {
    justify-content: center;
    gap: 14px;
  }

  /* Individual word spans */
  .word-group {
    white-space: nowrap;
    flex-shrink: 0;
    display: inline-flex;
    align-items: baseline;
  }
  .word, .sign {
    white-space: nowrap;
    flex-shrink: 0;
  }

  /* Basmala — centered */
  .basmala {
    direction: rtl;
    text-align: center;
    font-family: '${fontFamily}', serif;
    font-size: 37.2px;
    line-height: 1.0;
    color: ${t.textColor};
    padding: 0 4px;
    font-weight: 400;
  }

  .basmala .qcf {
    white-space: nowrap;
    font-family: '${basmalaFontFamily}', '${fontFamily}', serif;
  }

  /* Surah banner — ornamental frame with calligraphic surah name */
  .surah-banner {
    text-align: center;
    direction: ltr;
    padding: 0;
    margin: 2px 0;
  }
  .surah-banner .surah-frame {
    display: block;
    position: relative;
    width: 92%;
    height: 62px;
    margin: 0 auto;
    background-image: ${surahFrameBg ? surahFrameBg : 'none'};
    background-repeat: no-repeat;
    background-size: 100% 100%;
    border: ${surahFrameBg ? 'none' : `2px solid ${t.textColor}`};
  }
  .surah-banner .surah-frame::before {
    content: '';
    position: absolute;
    left: 28%;
    right: 28%;
    top: 8px;
    bottom: 8px;
    border: 1.5px solid #1f1f1f;
    border-radius: 999px;
    background: ${t.pageBg};
  }
  .surah-banner .surah-title {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'Geeza Pro', 'Traditional Arabic', serif;
    font-size: 40px;
    color: ${t.textColor};
    font-weight: 700;
    line-height: 1;
    transform: translateY(-1px);
    z-index: 1;
  }
  .surah-banner.trailing {
    margin: 8px 0 0;
  }

  /* Page number */
  .page-number {
    text-align: center;
    padding: 6px 0 14px;
    font-size: 18px;
    color: ${t.pageNumColor};
    font-family: -apple-system, 'Helvetica Neue', sans-serif;
  }
</style>
</head>
<body>
  <div class="page">
    <div class="header">
      <span class="juz">Juz' ${juz}</span>
      <span class="surah-name">${pageSurahs.map(s => {
        const m = surahMeta[s] || {};
        return `<span class="surah-ar">${m.name_ar || ''}</span> ${m.name_en || ''}`;
      }).join(' - ')}</span>
    </div>
    <div class="text-area${isOpeningPage ? ' opening-page' : isShortPage ? ' short-page' : ''}">
      ${linesHTML.join('\n      ')}
    </div>
    ${trailingBannerHTML ? `\n    ${trailingBannerHTML}` : ''}
    <div class="page-number">${pageNum}</div>
  </div>
</body>
</html>`;
}

async function renderPage(browser, pageNum, layout, surahMeta, outputDir, theme = 'light') {
  const html = buildPageHTML(pageNum, layout, surahMeta, theme);

  // Save HTML for debugging
  const htmlPath = join(TEST_DIR, `page_${String(pageNum).padStart(3, '0')}.html`);
  writeFileSync(htmlPath, html);

  // Use 2x DPI for sharp, crisp text rendering (retina-quality)
  const page = await browser.newPage({ deviceScaleFactor: 2 });
  await page.setViewportSize({ width: PAGE_WIDTH, height: PAGE_HEIGHT });

  // Load the HTML
  await page.setContent(html, { waitUntil: 'networkidle' });

  // Wait for fonts to load
  await page.waitForFunction(() => document.fonts.ready.then(() => true), { timeout: 10000 });

  // Ensure no line overflows the text area. This keeps long lines from clipping.
  await page.evaluate(() => {
    const fitTextLine = (line) => {
      let fontSize = parseFloat(window.getComputedStyle(line).fontSize);
      if (!Number.isFinite(fontSize)) return;
      let tries = 0;
      while (tries < 36) {
        const lineRect = line.getBoundingClientRect();
        const groups = Array.from(line.querySelectorAll(':scope > .word-group'));
        if (!groups.length) break;

        let minX = Number.POSITIVE_INFINITY;
        let maxX = Number.NEGATIVE_INFINITY;
        for (const group of groups) {
          const r = group.getBoundingClientRect();
          if (r.width <= 0) continue;
          minX = Math.min(minX, r.left);
          maxX = Math.max(maxX, r.right);
        }

        const overflowLeft = minX < lineRect.left - 0.5;
        const overflowRight = maxX > lineRect.right + 0.5;
        if ((!overflowLeft && !overflowRight) || fontSize <= 32) break;

        fontSize -= 0.5;
        line.style.fontSize = `${fontSize}px`;
        tries += 1;
      }
    };

    document.querySelectorAll('.text-line').forEach(fitTextLine);

    document.querySelectorAll('.basmala').forEach((line) => {
      let fontSize = parseFloat(window.getComputedStyle(line).fontSize);
      let tries = 0;
      while (tries < 20 && line.scrollWidth > line.clientWidth + 1 && fontSize > 30) {
        fontSize -= 0.5;
        line.style.fontSize = `${fontSize}px`;
        tries += 1;
      }
    });
  });

  // Extract word bounding boxes for manifest (word-by-word interactivity)
  // Note: getBoundingClientRect returns CSS pixels; PNG is rendered at 2x DPI
  // so we multiply by deviceScaleFactor for accurate tap coordinates on the PNG
  const DPI_SCALE = 2;
  const wordBoxes = await page.evaluate((scale) => {
    const boxes = [];
    document.querySelectorAll('.word').forEach(el => {
      const rect = el.getBoundingClientRect();
      const loc = el.getAttribute('data-loc') || '';
      const text = el.textContent || '';
      boxes.push({
        location: loc,
        text: text,
        x: Math.round(rect.x * scale),
        y: Math.round(rect.y * scale),
        w: Math.round(rect.width * scale),
        h: Math.round(rect.height * scale),
      });
    });
    return boxes;
  }, DPI_SCALE);

  // Take screenshot
  const pagesDir = join(outputDir, 'pages');
  mkdirSync(pagesDir, { recursive: true });
  const pngPath = join(pagesDir, `page_${String(pageNum).padStart(3, '0')}.png`);
  await page.screenshot({ path: pngPath, type: 'png' });

  // Save manifest with word hitboxes
  const ayatOnPage = new Set();
  for (const wb of wordBoxes) {
    if (wb.location) {
      const parts = wb.location.split(':');
      if (parts.length >= 2) ayatOnPage.add(`${parts[0]}:${parts[1]}`);
    }
  }
  const ayatSorted = [...ayatOnPage].sort((a, b) => {
    const [sa, aa] = a.split(':').map(Number);
    const [sb, ab] = b.split(':').map(Number);
    return sa !== sb ? sa - sb : aa - ab;
  });
  const firstAyah = ayatSorted[0]?.split(':').map(Number) || [0, 0];
  const lastAyah = ayatSorted[ayatSorted.length - 1]?.split(':').map(Number) || [0, 0];

  const manifest = {
    page: pageNum,
    surah_start: firstAyah[0],
    ayah_start: firstAyah[1],
    surah_end: lastAyah[0],
    ayah_end: lastAyah[1],
    schema_version: '1.0.0',
    image_width: PAGE_WIDTH * DPI_SCALE,
    image_height: PAGE_HEIGHT * DPI_SCALE,
    renderer: 'qcf-v2-browser',
    words: wordBoxes,
  };
  const manifestDir = join(outputDir, 'manifests');
  mkdirSync(manifestDir, { recursive: true });
  const manifestPath = join(manifestDir, `page_${String(pageNum).padStart(3, '0')}.manifest.json`);
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  // Thumbnail
  const thumbPath = join(pagesDir, `page_${String(pageNum).padStart(3, '0')}_thumb.png`);
  await page.setViewportSize({ width: PAGE_WIDTH / 4, height: PAGE_HEIGHT / 4 });
  await page.evaluate(({w, h}) => {
    document.body.style.transform = `scale(0.25)`;
    document.body.style.transformOrigin = 'top left';
    document.body.style.width = `${w}px`;
    document.body.style.height = `${h}px`;
  }, {w: PAGE_WIDTH, h: PAGE_HEIGHT});
  await page.screenshot({ path: thumbPath, type: 'png', clip: { x: 0, y: 0, width: PAGE_WIDTH / 4, height: PAGE_HEIGHT / 4 } });

  await page.close();
  return pngPath;
}

async function main() {
  const args = process.argv.slice(2);
  let pageArg = null;
  let pagesArg = null;
  // let goldenOnly = false;
  let theme = 'light';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--page') pageArg = parseInt(args[++i]);
    if (args[i] === '--pages') pagesArg = args[++i];
    // if (args[i] === '--golden-only') goldenOnly = true;
    if (args[i] === '--theme') theme = args[++i] || 'light';
  }

  console.log('='.repeat(60));
  console.log('Miftah — Browser-based QCF V2 Renderer (Playwright)');
  console.log('='.repeat(60));

  const surahMeta = loadSurahMeta();
  console.log(`Surahs loaded: ${Object.keys(surahMeta).length}`);

  const browser = await chromium.launch({ headless: true });
  console.log('Browser launched');

  try {
    console.log(`Theme: ${theme}`);

    if (pageArg) {
      const layout = loadLayout(pageArg);
      if (!layout) { console.error(`No layout for page ${pageArg}`); return; }
      const path = await renderPage(browser, pageArg, layout, surahMeta, TEST_DIR, theme);
      console.log(`Rendered page ${pageArg}: ${path}`);
    } else if (pagesArg) {
      const [s, e] = pagesArg.split('-').map(Number);
      const end = e || s;
      
      const tasks = [];
      for (let p = s; p <= end; p++) {
        const layout = loadLayout(p);
        if (layout) tasks.push({ page: p, layout });
      }

      const CONCURRENCY = 6;
      let currentIndex = 0;
      let completed = 0;

      const workers = Array.from({ length: CONCURRENCY }, async () => {
        // give each worker a separate browser context to avoid racing
        const context = await browser.newContext({
          viewport: { width: PAGE_WIDTH, height: PAGE_HEIGHT },
          deviceScaleFactor: 2
        });

        while (true) {
          const idx = currentIndex++;
          if (idx >= tasks.length) break;
          const { page, layout } = tasks[idx];
          try {
            // pass context in place of generic browser
            await renderPage(context, page, layout, surahMeta, join(ASSETS_DIR), theme);
            completed++;
            if (completed % 20 === 0 || completed === tasks.length) {
              console.log(`  Rendered ${completed} pages (current: ${page})`);
            }
          } catch (err) {
            console.error(`Failed on page ${page}:`, err);
          }
        }
        await context.close();
      });

      console.log(`Starting ${tasks.length} pages across ${CONCURRENCY} workers...`);
      await Promise.all(workers);
      console.log(`Done: ${completed} pages`);
    } else {
      // Default: render page 6 as test
      const layout = loadLayout(6);
      if (!layout) { console.error('No layout for page 6'); return; }
      const path = await renderPage(browser, 6, layout, surahMeta, join(TEST_DIR), theme);
      console.log(`Test render page 6: ${path}`);
    }
  } finally {
    await browser.close();
  }

  console.log('Done.');
}

main().catch(err => { console.error(err); process.exit(1); });
