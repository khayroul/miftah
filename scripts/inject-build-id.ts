// scripts/inject-build-id.ts
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const SW_PATH = path.join(process.cwd(), "public", "sw.js");

function getGitSha(): string {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf-8" }).trim();
  } catch {
    return Date.now().toString(36);
  }
}

function getCdnVersion(): string {
  const assetsPath = path.join(process.cwd(), "src", "lib", "mushafAssets.ts");
  const content = readFileSync(assetsPath, "utf-8");
  const match = content.match(/CDN_ASSET_VERSION\s*=\s*"(\d+)"/);
  return match ? match[1] : "1";
}

function main(): void {
  const buildId = getGitSha();
  const cdnVersion = getCdnVersion();

  let sw = readFileSync(SW_PATH, "utf-8");
  sw = sw.replace('"__BUILD_ID__"', `"${buildId}"`);
  sw = sw.replace('"__CDN_ASSET_VERSION__"', `"${cdnVersion}"`);

  writeFileSync(SW_PATH, sw, "utf-8");
  console.log(`Injected BUILD_ID=${buildId}, CDN_ASSET_VERSION=${cdnVersion} into sw.js`);
}

main();
