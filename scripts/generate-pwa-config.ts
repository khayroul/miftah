import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const OUTPUT_PATH = path.join(process.cwd(), "public", "pwa-config.json");

function extractCdnVersion(): string {
  const assetsPath = path.join(process.cwd(), "src", "mushaf", "lib", "mushafAssets.ts");
  const content = readFileSync(assetsPath, "utf-8");
  const match = content.match(/CDN_ASSET_VERSION\s*=\s*"(\d+)"/);
  if (!match) throw new Error("Could not find CDN_ASSET_VERSION in mushafAssets.ts");
  return match[1];
}

function getBuildId(): string {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf-8" }).trim();
  } catch {
    return "unknown";
  }
}

function main(): void {
  const cdnVersion = extractCdnVersion();
  const appBuildId = getBuildId();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  if (!supabaseUrl) {
    console.warn("⚠️  NEXT_PUBLIC_SUPABASE_URL not set. Offline downloads will not work until configured.");
  }
  const pagesBucket = process.env.MUSHAF_PAGES_BUCKET?.trim() || "mushaf-pages";
  const manifestsBucket = process.env.MUSHAF_MANIFESTS_BUCKET?.trim() || "mushaf-manifests";
  const temaDataVersion = process.env.TEMA_DATA_VERSION?.trim() || "1";
  const fahamDataVersion = process.env.FAHAM_DATA_VERSION?.trim() || "1";
  const storageBase = supabaseUrl
    ? `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public`
    : "";

  const config = {
    cdnAssetVersion: cdnVersion,
    temaDataVersion,
    fahamDataVersion,
    supabaseStorageBase: storageBase,
    pagesBucket,
    manifestsBucket,
    appBuildId,
  };
  mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(config, null, 2), "utf-8");
  console.log(
    `Generated ${OUTPUT_PATH} (version: ${cdnVersion}, tema: ${temaDataVersion}, faham: ${fahamDataVersion}, build: ${appBuildId})`,
  );
}

main();
