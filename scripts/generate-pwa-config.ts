import { MUSHAF_CDN_ASSET_VERSION } from "../src/mushaf/lib/mushafAssetVersion";

export interface PwaConfigEnvironment {
  readonly [key: string]: string | undefined;
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
