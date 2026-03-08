#!/usr/bin/env node
/**
 * Fetch reference mushaf page screenshots from quran.com in Reading mode.
 * This shows the full mushaf page layout (not verse-by-verse).
 *
 * Usage:
 *   node fetch_references.mjs --pages 1,2,6,586,604
 */

import { chromium } from 'playwright';
import { mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..');
const REF_DIR = join(PROJECT_ROOT, 'test', 'references');

mkdirSync(REF_DIR, { recursive: true });

async function fetchPage(page, pageNum, isFirstPage) {
  const outPath = join(REF_DIR, `ref_page_${String(pageNum).padStart(3, '0')}.png`);
  if (existsSync(outPath)) {
    console.log(`  Skip page ${pageNum} (already exists)`);
    return outPath;
  }

  const url = `https://quran.com/page/${pageNum}`;
  console.log(`  Fetching ${url}...`);

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(3000);

  // On first page, switch to Reading mode and dismiss popups
  if (isFirstPage) {
    // Dismiss any cookie/popup banners
    try {
      const closeSelectors = [
        'button:has-text("Accept")',
        'button:has-text("Got it")',
        'button:has-text("OK")',
        '[aria-label="Close"]',
      ];
      for (const sel of closeSelectors) {
        const btn = page.locator(sel).first();
        if (await btn.isVisible({ timeout: 1500 }).catch(() => false)) {
          await btn.click();
          await page.waitForTimeout(500);
        }
      }
    } catch { /* no popup */ }

    // Click the "Reading" tab/button to switch to mushaf page view
    try {
      const readingBtn = page.locator('button:has-text("Reading"), a:has-text("Reading"), [data-testid="reading-mode"]').first();
      if (await readingBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await readingBtn.click();
        console.log('    Switched to Reading mode');
        await page.waitForTimeout(3000);
      }
    } catch {
      console.log('    Could not find Reading button');
    }
  }

  // Wait for QCF fonts to render
  await page.waitForTimeout(3000);

  // Try to find the mushaf page container and screenshot just that
  // quran.com Reading mode renders pages in a scrollable container
  const pageContainer = page.locator('[data-page-number], .mushaf-page, [class*="Page_"]').first();
  if (await pageContainer.isVisible({ timeout: 3000 }).catch(() => false)) {
    await pageContainer.screenshot({ path: outPath, type: 'png' });
    console.log(`  Saved (container): ${outPath}`);
  } else {
    // Fallback: screenshot the full viewport
    await page.screenshot({ path: outPath, type: 'png' });
    console.log(`  Saved (viewport): ${outPath}`);
  }

  return outPath;
}

async function main() {
  const args = process.argv.slice(2);
  let pages = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--pages') {
      const val = args[++i];
      for (const part of val.split(',')) {
        if (part.includes('-')) {
          const [s, e] = part.split('-').map(Number);
          for (let p = s; p <= e; p++) pages.push(p);
        } else {
          pages.push(Number(part));
        }
      }
    }
  }

  if (pages.length === 0) {
    pages = [1, 2, 3, 6, 586, 590, 604];
  }

  console.log(`Fetching ${pages.length} reference pages from quran.com (Reading mode)...`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ deviceScaleFactor: 2 });
  await page.setViewportSize({ width: 768, height: 1280 });

  try {
    for (let i = 0; i < pages.length; i++) {
      try {
        await fetchPage(page, pages[i], i === 0);
      } catch (err) {
        console.log(`  ERROR page ${pages[i]}: ${err.message}`);
      }
    }
  } finally {
    await page.close();
    await browser.close();
  }

  console.log('Done fetching references.');
}

main().catch(err => { console.error(err); process.exit(1); });
