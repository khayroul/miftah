// scripts/inject-build-id.ts
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { MUSHAF_CDN_ASSET_VERSION } from "../src/mushaf/lib/mushafAssetVersion";

const SW_PATH = path.join(process.cwd(), "public", "sw.js");

function getGitSha(): string {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf-8" }).trim();
  } catch {
    return Date.now().toString(36);
  }
}

export function injectBuildMetadata(sw: string, buildId: string): string {
  return sw
    .replace('"__BUILD_ID__"', `"${buildId}"`)
    .replace('"__CDN_ASSET_VERSION__"', `"${MUSHAF_CDN_ASSET_VERSION}"`);
}

function main(): void {
  const buildId = getGitSha();
  const sw = injectBuildMetadata(readFileSync(SW_PATH, "utf-8"), buildId);

  writeFileSync(SW_PATH, sw, "utf-8");
  console.log(
    `Injected BUILD_ID=${buildId}, CDN_ASSET_VERSION=${MUSHAF_CDN_ASSET_VERSION} into sw.js`,
  );
}

const entryPath = process.argv[1];
if (entryPath && import.meta.url === pathToFileURL(path.resolve(entryPath)).href) {
  main();
}
