import {
  CACHE_BUNDLE,
  LS_KEY_PACKAGE_CHECKPOINT,
} from "./mushafStatus";
import {
  TOTAL_DATA_ENTRIES,
  TOTAL_FONT_ENTRIES,
  TOTAL_ITEMS,
  TOTAL_PAGES,
  TOTAL_ROUTE_ENTRIES,
  TOTAL_SHELL_ENTRIES,
  TOTAL_TEMA_ENTRIES,
  isTemaRoutePath,
} from "./offlineBundle";
import type { PwaConfig } from "./downloadConfig";

export type DownloadPackageId = "tema" | "mushaf";

export interface DownloadPackageDefinition {
  readonly id: DownloadPackageId;
  readonly label: string;
  readonly index: number;
  readonly count: number;
  readonly totalItems: number;
}

export interface PackageProgressState {
  readonly temaCompletedItems: number;
  readonly mushafCompletedItems: number;
}

export type MushafDownloadProgress = {
  readonly completedItems: number;
  readonly totalItems: number;
  readonly packageId: DownloadPackageId;
  readonly packageLabel: string;
  readonly packageIndex: number;
  readonly packageCount: number;
  readonly packageCompletedItems: number;
  readonly packageTotalItems: number;
};

export type ProgressCallback = (progress: MushafDownloadProgress) => void;

export const TEMA_PACKAGE_TOTAL_ITEMS = TOTAL_TEMA_ENTRIES * 2;
const MUSHAF_ROUTE_TOTAL_ITEMS = TOTAL_ROUTE_ENTRIES - TOTAL_TEMA_ENTRIES;
export const MUSHAF_PACKAGE_TOTAL_ITEMS =
  TOTAL_PAGES +
  TOTAL_DATA_ENTRIES +
  TOTAL_FONT_ENTRIES +
  TOTAL_SHELL_ENTRIES +
  MUSHAF_ROUTE_TOTAL_ITEMS;

export const DOWNLOAD_PACKAGES: readonly DownloadPackageDefinition[] = [
  { id: "tema", label: "Tema", index: 1, count: 2, totalItems: TEMA_PACKAGE_TOTAL_ITEMS },
  { id: "mushaf", label: "Mushaf", index: 2, count: 2, totalItems: MUSHAF_PACKAGE_TOTAL_ITEMS },
] as const;

const DOWNLOAD_PACKAGE_MAP: Readonly<Record<DownloadPackageId, DownloadPackageDefinition>> = {
  tema: DOWNLOAD_PACKAGES[0],
  mushaf: DOWNLOAD_PACKAGES[1],
};

export function clampCount(value: number, max: number): number {
  return Math.max(0, Math.min(value, max));
}

export function emitProgress(
  completedItems: number,
  packageId: DownloadPackageId,
  packageProgress: PackageProgressState,
  onProgress?: ProgressCallback,
): void {
  if (onProgress === undefined) return;
  const definition = DOWNLOAD_PACKAGE_MAP[packageId];
  const rawCompleted = packageId === "tema"
    ? packageProgress.temaCompletedItems
    : packageProgress.mushafCompletedItems;

  onProgress({
    completedItems: clampCount(completedItems, TOTAL_ITEMS),
    totalItems: TOTAL_ITEMS,
    packageId,
    packageLabel: definition.label,
    packageIndex: definition.index,
    packageCount: definition.count,
    packageCompletedItems: clampCount(rawCompleted, definition.totalItems),
    packageTotalItems: definition.totalItems,
  });
}

export function withTemaProgress(
  progress: PackageProgressState,
  increment: number,
): PackageProgressState {
  return {
    ...progress,
    temaCompletedItems: clampCount(
      progress.temaCompletedItems + increment,
      TEMA_PACKAGE_TOTAL_ITEMS,
    ),
  };
}

export function withMushafProgress(
  progress: PackageProgressState,
  increment: number,
): PackageProgressState {
  return {
    ...progress,
    mushafCompletedItems: clampCount(
      progress.mushafCompletedItems + increment,
      MUSHAF_PACKAGE_TOTAL_ITEMS,
    ),
  };
}

interface DownloadCheckpoint {
  readonly packageId: DownloadPackageId;
  readonly cdnAssetVersion: string;
  readonly temaDataVersion: string;
  readonly appBuildId: string;
}

export function clearDownloadCheckpoint(): void {
  localStorage.removeItem(LS_KEY_PACKAGE_CHECKPOINT);
}

function parseDownloadCheckpoint(raw: string): DownloadCheckpoint | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const record = parsed as Record<string, unknown>;

    if (record.packageId !== "tema" && record.packageId !== "mushaf") return null;
    if (typeof record.cdnAssetVersion !== "string") return null;
    if (typeof record.temaDataVersion !== "string") return null;
    if (typeof record.appBuildId !== "string") return null;

    return {
      packageId: record.packageId,
      cdnAssetVersion: record.cdnAssetVersion,
      temaDataVersion: record.temaDataVersion,
      appBuildId: record.appBuildId,
    };
  } catch {
    return null;
  }
}

export function readDownloadCheckpoint(
  cdnAssetVersion: string,
  temaDataVersion: string,
  appBuildId: string,
): DownloadCheckpoint | null {
  const raw = localStorage.getItem(LS_KEY_PACKAGE_CHECKPOINT);
  if (raw === null) return null;
  const parsed = parseDownloadCheckpoint(raw);

  if (
    parsed === null ||
    parsed.cdnAssetVersion !== cdnAssetVersion ||
    parsed.temaDataVersion !== temaDataVersion ||
    parsed.appBuildId !== appBuildId
  ) {
    clearDownloadCheckpoint();
    return null;
  }
  return parsed;
}

export function getDownloadCheckpointPackage(
  config: Pick<PwaConfig, "cdnAssetVersion" | "temaDataVersion" | "appBuildId">,
): DownloadPackageId | null {
  return readDownloadCheckpoint(
    config.cdnAssetVersion,
    config.temaDataVersion ?? "1",
    config.appBuildId ?? "unknown",
  )?.packageId ?? null;
}

export function writeDownloadCheckpoint(
  packageId: DownloadPackageId,
  cdnAssetVersion: string,
  temaDataVersion: string,
  appBuildId: string,
): void {
  localStorage.setItem(LS_KEY_PACKAGE_CHECKPOINT, JSON.stringify({
    packageId,
    cdnAssetVersion,
    temaDataVersion,
    appBuildId,
  }));
}

async function countTemaRouteEntries(): Promise<number> {
  const cache = await caches.open(CACHE_BUNDLE);
  const keys = await cache.keys();
  return keys.reduce((count, request) => {
    return isTemaRoutePath(new URL(request.url).pathname) ? count + 1 : count;
  }, 0);
}

export async function resolveInitialPackageState(
  completedItems: number,
  temaCompletedItems: number,
): Promise<{ packageId: DownloadPackageId; packageProgress: PackageProgressState }> {
  const temaRouteEntries = await countTemaRouteEntries();
  const temaProgress = clampCount(
    temaCompletedItems + temaRouteEntries,
    TEMA_PACKAGE_TOTAL_ITEMS,
  );
  const packageProgress = {
    temaCompletedItems: temaProgress,
    mushafCompletedItems: clampCount(
      completedItems - temaProgress,
      MUSHAF_PACKAGE_TOTAL_ITEMS,
    ),
  };

  return {
    packageId: temaProgress < TEMA_PACKAGE_TOTAL_ITEMS ? "tema" : "mushaf",
    packageProgress,
  };
}
