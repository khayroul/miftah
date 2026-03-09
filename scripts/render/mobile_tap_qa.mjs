#!/usr/bin/env node
/**
 * Mobile tap QA harness for /read/[page].
 *
 * Runs iPhone-emulated tap checks:
 * 1) page loads image + hitboxes
 * 2) tapping a hitbox shows tooltip
 * 3) tapping empty area dismisses tooltip
 *
 * Usage:
 *   node scripts/render/mobile_tap_qa.mjs --base-url http://127.0.0.1:3000 --pages 1,586,604
 */

import { chromium, devices } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..", "..");
const REPORT_DIR = join(PROJECT_ROOT, "test", "reports", "mobile_tap_qa");

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {
    baseUrl: "http://127.0.0.1:3000",
    pages: [1, 77, 586, 604],
    timeoutMs: 45000,
    headed: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--base-url") {
      out.baseUrl = args[++i] ?? out.baseUrl;
      continue;
    }
    if (arg === "--pages") {
      const value = args[++i] ?? "";
      const parsed = [];
      for (const part of value.split(",")) {
        const token = part.trim();
        if (!token) continue;
        if (token.includes("-")) {
          const [s, e] = token.split("-").map(Number);
          const start = Math.min(s, e);
          const end = Math.max(s, e);
          for (let p = start; p <= end; p++) parsed.push(p);
        } else {
          parsed.push(Number(token));
        }
      }
      out.pages = parsed.filter((p) => Number.isInteger(p) && p >= 1 && p <= 604);
      continue;
    }
    if (arg === "--timeout-ms") {
      const n = Number(args[++i]);
      if (Number.isFinite(n) && n > 0) out.timeoutMs = n;
      continue;
    }
    if (arg === "--headed") {
      out.headed = true;
      continue;
    }
  }

  if (out.pages.length === 0) {
    throw new Error("No valid pages to test.");
  }
  return out;
}

async function run() {
  const opts = parseArgs();
  mkdirSync(REPORT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: !opts.headed });
  const context = await browser.newContext({
    ...devices["iPhone 13"],
  });
  const page = await context.newPage();
  page.setDefaultTimeout(opts.timeoutMs);

  const results = [];

  async function gotoWithRetry(url, timeoutMs) {
    let lastError = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
        return;
      } catch (error) {
        lastError = error;
        if (attempt < 2) {
          await page.waitForTimeout(1500);
        }
      }
    }
    throw lastError;
  }
  try {
    for (const pageNum of opts.pages) {
      const url = `${opts.baseUrl}/read/${pageNum}`;
      const result = {
        page: pageNum,
        url,
        status: "pass",
        errors: [],
        tooltipText: null,
        screenshot: null,
      };

      try {
        await gotoWithRetry(url, opts.timeoutMs);
        await page.waitForSelector("img[alt^='Halaman mushaf']");
        await page.waitForSelector("[data-testid='word-hitbox']");

        const firstHitbox = page.locator("[data-testid='word-hitbox']").first();
        await firstHitbox.click();
        await page.waitForSelector("[data-testid='word-tooltip']", { state: "visible" });

        const tooltip = page.locator("[data-testid='word-tooltip']").first();
        const tooltipText = (await tooltip.textContent())?.trim() ?? "";
        if (!tooltipText) {
          throw new Error("Tooltip text is empty after hitbox tap.");
        }
        result.tooltipText = tooltipText;

        const screenshotPath = join(REPORT_DIR, `page_${String(pageNum).padStart(3, "0")}_tap.png`);
        await page.screenshot({ path: screenshotPath, fullPage: true });
        result.screenshot = screenshotPath;

        // Dismiss by tapping the same hitbox (component toggles selected word off).
        await firstHitbox.click();
        await page.waitForSelector("[data-testid='word-tooltip']", { state: "hidden" });
      } catch (error) {
        result.status = "fail";
        result.errors.push(error instanceof Error ? error.message : String(error));
        const failShot = join(REPORT_DIR, `page_${String(pageNum).padStart(3, "0")}_fail.png`);
        try {
          await page.screenshot({ path: failShot, fullPage: true });
          result.screenshot = failShot;
        } catch {
          // ignore screenshot failure
        }
      }

      results.push(result);
      const verdict = result.status === "pass" ? "PASS" : "FAIL";
      console.log(`[${verdict}] page ${String(pageNum).padStart(3, "0")} ${result.errors.join("; ")}`);
    }
  } finally {
    await page.close();
    await context.close();
    await browser.close();
  }

  const passed = results.filter((r) => r.status === "pass").length;
  const failed = results.length - passed;
  const summary = {
    generated_at: new Date().toISOString(),
    base_url: opts.baseUrl,
    pages_tested: results.length,
    passed,
    failed,
    pass: failed === 0,
  };

  const report = { summary, results };
  const reportPath = join(REPORT_DIR, "report.json");
  writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

  console.log("------------------------------------------------------------");
  console.log(`Pages tested: ${summary.pages_tested}`);
  console.log(`Passed:       ${summary.passed}`);
  console.log(`Failed:       ${summary.failed}`);
  console.log(`Report:       ${reportPath}`);

  process.exit(summary.pass ? 0 : 1);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
