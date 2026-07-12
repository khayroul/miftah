#!/usr/bin/env node
/**
 * Phase-0 visual baseline capture (docs/superpowers/specs/2026-07-13-consolidation-rebuild-launch-design.md
 * §3 Phase-0 item 4): a screenshot corpus of every route at 4 viewports, taken
 * against a production build (`npm run build && npx next start -p 3199`).
 *
 * Usage:
 *   BASELINE_BASE_URL=http://localhost:3199 node docs/baseline/capture.mjs
 *
 * Output:
 *   docs/baseline/<DATE>/<route-slug>__<w>x<h>.png
 *   docs/baseline/<DATE>/manifest.json
 *
 * This script is reusable for Phase-1 wave exit-gate screenshot-diffs
 * (spec §3 Phase 1: "Playwright screenshots + pixelmatch ... per wave").
 * Re-run with a new DATE-stamped output dir per wave.
 */

import { chromium } from "playwright";
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BASE_URL = process.env.BASELINE_BASE_URL ?? "http://localhost:3199";
const DATE_STAMP = process.env.BASELINE_DATE ?? "2026-07-13";
const OUT_DIR = path.join(__dirname, DATE_STAMP);

const VIEWPORTS = [
  { width: 360, height: 780 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 1366 },
];

// Route inventory: enumerated from src/app/**/page.tsx (public app routes,
// API routes under src/app/api/** excluded). Dynamic routes use
// representative params per the W-I task brief.
const ROUTES = [
  { route: "/", slug: "home", notes: "Root dashboard; getOptionalAuthUser -> logged-out state (no session cookie in this lane)." },
  { route: "/read", slug: "read-index", notes: "Server-redirects (307) to /read/1; Playwright follows the redirect, so this capture is pixel-identical to read-1." },
  { route: "/read/1", slug: "read-1", notes: "Al-Fatihah, first mushaf page." },
  { route: "/read/302", slug: "read-302", notes: "Mid-mushaf page (representative)." },
  { route: "/read/604", slug: "read-604", notes: "Last mushaf page." },
  { route: "/read/1/tools", slug: "read-1-tools", notes: "Reading tools overlay for page 1." },
  { route: "/read/302/tools", slug: "read-302-tools", notes: "Reading tools overlay for page 302." },
  { route: "/read/604/tools", slug: "read-604-tools", notes: "Reading tools overlay for page 604." },
  { route: "/read/surah/36/themes", slug: "read-surah-36-themes", notes: "Ya-Sin theme-appearance page." },
  { route: "/read/surah/2/themes", slug: "read-surah-2-themes", notes: "Al-Baqarah theme-appearance page (has theme-chunk fixture data per .tmp/check_surah2_theme_links.ts)." },
  { route: "/hifz", slug: "hifz", notes: "Hifz overview; logged-out (no MIFTAH_USER_ID session in this lane, server falls back gracefully)." },
  { route: "/faham", slug: "faham", notes: "Faham (vocabulary) overview; logged-out." },
  { route: "/dashboard-preview", slug: "dashboard-preview", notes: "force-dynamic preview route; reads process.env.MIFTAH_USER_ID server-side (present in .env.local) so may render seeded data even though the browser session is logged-out." },
  { route: "/auth/sign-in", slug: "auth-sign-in", notes: "Logged-out sign-in form (renders directly; redirects to / only if a session exists)." },
  { route: "/auth/forgot-password", slug: "auth-forgot-password", notes: "Client-only form, no auth gate." },
  { route: "/auth/magic", slug: "auth-magic", notes: "Client-only magic-link completion screen; no code/token param supplied, so this captures the default/error messaging state." },
  { route: "/auth/reset-password", slug: "auth-reset-password", notes: "Client-only form, no auth gate." },
];

async function settle(page) {
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  // Small settle delay for CSS transitions / fonts / late client hydration.
  await page.waitForTimeout(500);
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch();
  const manifestEntries = [];
  const failures = [];

  for (const { route, slug, notes } of ROUTES) {
    for (const viewport of VIEWPORTS) {
      const vpLabel = `${viewport.width}x${viewport.height}`;
      const fileName = `${slug}__${vpLabel}.png`;
      const filePath = path.join(OUT_DIR, fileName);

      const context = await browser.newContext({
        viewport,
        reducedMotion: "reduce",
        colorScheme: "light",
      });
      const page = await context.newPage();

      let status = "captured";
      let httpStatus = null;
      let errorMessage = null;

      try {
        const response = await page.goto(`${BASE_URL}${route}`, {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        });
        httpStatus = response ? response.status() : null;
        await settle(page);
        await page.screenshot({ path: filePath, fullPage: true, animations: "disabled" });
      } catch (err) {
        status = "failed";
        errorMessage = err instanceof Error ? err.message : String(err);
        failures.push({ route, viewport: vpLabel, error: errorMessage });
        console.error(`[FAILED] ${route} @ ${vpLabel}: ${errorMessage}`);
      } finally {
        await context.close();
      }

      manifestEntries.push({
        route,
        viewport: vpLabel,
        file: `${DATE_STAMP}/${fileName}`,
        fullPage: true,
        httpStatus,
        status,
        error: errorMessage,
        notes,
      });

      console.log(`[${status}] ${route} @ ${vpLabel} (http ${httpStatus}) -> ${fileName}`);
    }
  }

  await browser.close();

  let gitSha = null;
  try {
    gitSha = execSync("git rev-parse HEAD", { cwd: path.join(__dirname, "..", ".."), encoding: "utf8" }).trim();
  } catch {
    gitSha = null;
  }

  const manifest = {
    _meta: {
      capturedAt: new Date().toISOString(),
      dateStamp: DATE_STAMP,
      gitSha,
      baseUrl: BASE_URL,
      viewports: VIEWPORTS.map((v) => `${v.width}x${v.height}`),
      routeCount: ROUTES.length,
      screenshotCount: manifestEntries.length,
      failureCount: failures.length,
      purpose: "Phase-0 visual baseline (spec 2026-07-13-consolidation-rebuild-launch-design.md §3 Phase-0 item 4) — zero-regression reference for Phase-1 restructure.",
    },
    entries: manifestEntries,
  };

  writeFileSync(path.join(OUT_DIR, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

  console.log(`\nDone. ${manifestEntries.length} screenshots, ${failures.length} failures.`);
  if (failures.length > 0) {
    console.error("Failures:", JSON.stringify(failures, null, 2));
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
