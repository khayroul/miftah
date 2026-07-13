export interface PwaConfig {
  readonly cdnAssetVersion: string;
  readonly temaDataVersion?: string;
  readonly fahamDataVersion?: string;
  readonly supabaseStorageBase: string;
  readonly pagesBucket: string;
  readonly manifestsBucket: string;
  readonly appBuildId?: string;
}

export interface PageAssetUrls {
  readonly webp: string;
  readonly manifest: string;
  readonly layout: string;
  readonly translation: string;
}

let cachedConfig: PwaConfig | null = null;

export async function loadPwaConfig(): Promise<PwaConfig> {
  if (cachedConfig !== null) return cachedConfig;

  const response = await fetch("/pwa-config.json");
  if (!response.ok) {
    throw new Error(`Failed to load pwa-config.json: ${response.status}`);
  }

  const data: unknown = await response.json();
  if (!isPwaConfig(data)) {
    throw new Error("Invalid pwa-config.json: missing required fields");
  }

  cachedConfig = data;
  return data;
}

function isPwaConfig(value: unknown): value is PwaConfig {
  if (typeof value !== "object" || value === null) return false;
  const config = value as Record<string, unknown>;
  return (
    typeof config.cdnAssetVersion === "string" &&
    typeof config.supabaseStorageBase === "string" &&
    typeof config.pagesBucket === "string" &&
    typeof config.manifestsBucket === "string" &&
    (typeof config.fahamDataVersion === "string" ||
      typeof config.fahamDataVersion === "undefined") &&
    (typeof config.appBuildId === "string" ||
      typeof config.appBuildId === "undefined")
  );
}

export function buildPageAssetUrls(
  pageNumber: number,
  config: PwaConfig,
): PageAssetUrls {
  const padded = String(pageNumber).padStart(3, "0");
  const base = config.supabaseStorageBase.trim();
  const version = config.cdnAssetVersion;

  if (!base) {
    return {
      webp: `/api/mushaf/page/${pageNumber}?variant=mobile`,
      manifest: `/api/mushaf/manifest/${pageNumber}`,
      layout: `/layouts/page-${padded}.json`,
      translation: `/translations/page-${padded}.json`,
    };
  }

  return {
    webp: `${base}/${config.pagesBucket}/page_${padded}_mobile.webp?v=${version}`,
    manifest: `${base}/${config.manifestsBucket}/page_${padded}.manifest.json?v=${version}`,
    layout: `/layouts/page-${padded}.json`,
    translation: `/translations/page-${padded}.json`,
  };
}
