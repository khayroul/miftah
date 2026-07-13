import { writeFileSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { MUSHAF_CDN_ASSET_VERSION } from "../src/mushaf/lib/mushafAssetVersion";

const OUTPUT_PATH = path.join(process.cwd(), "public", "pwa-config.json");

function getBuildId(): string {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf-8" }).trim();
  } catch {
    return "unknown";
  }
}

interface PwaConfigEnvironment {
  readonly NEXT_PUBLIC_SUPABASE_URL?: string;
  readonly MUSHAF_PAGES_BUCKET?: string;
  readonly MUSHAF_MANIFESTS_BUCKET?: string;
  readonly TEMA_DATA_VERSION?: string;
  readonly FAHAM_DATA_VERSION?: string;
}

export function createPwaConfig(
  appBuildId: string,
  environment: PwaConfigEnvironment = process.env as PwaConfigEnvironment,
) {
  const supabaseUrl = environment.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  if (!supabaseUrl) {
    console.warn("⚠️  NEXT_PUBLIC_SUPABASE_URL not set. Offline downloads will not work until configured.");
  }
  const pagesBucket = environment.MUSHAF_PAGES_BUCKET?.trim() || "mushaf-pages";
  const manifestsBucket =
    environment.MUSHAF_MANIFESTS_BUCKET?.trim() || "mushaf-manifests";
  const temaDataVersion = environment.TEMA_DATA_VERSION?.trim() || "1";
  const fahamDataVersion = environment.FAHAM_DATA_VERSION?.trim() || "1";
  const storageBase = supabaseUrl
    ? `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public`
    : "";

  return {
    cdnAssetVersion: MUSHAF_CDN_ASSET_VERSION,
    temaDataVersion,
    fahamDataVersion,
    supabaseStorageBase: storageBase,
    pagesBucket,
    manifestsBucket,
    appBuildId,
  };
}

function main(): void {
  const config = createPwaConfig(getBuildId());
  mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(config, null, 2), "utf-8");
  console.log(
    `Generated ${OUTPUT_PATH} (version: ${config.cdnAssetVersion}, tema: ${config.temaDataVersion}, faham: ${config.fahamDataVersion}, build: ${config.appBuildId})`,
  );
}

const entryPath = process.argv[1];
if (entryPath && import.meta.url === pathToFileURL(path.resolve(entryPath)).href) {
  main();
}
