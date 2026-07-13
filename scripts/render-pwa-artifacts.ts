import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  createPwaConfig,
  type PwaConfigEnvironment,
} from "./generate-pwa-config";
import { MUSHAF_CDN_ASSET_VERSION } from "../src/mushaf/lib/mushafAssetVersion";

export const SW_TEMPLATE_PATH = path.join(process.cwd(), "scripts", "sw.template.js");
export const SW_OUTPUT_PATH = path.join(process.cwd(), "public", "sw.js");
export const PWA_CONFIG_OUTPUT_PATH = path.join(
  process.cwd(),
  "public",
  "pwa-config.json",
);

const BUILD_PLACEHOLDER = "__MIFTAH_BUILD_ID__";
const CDN_PLACEHOLDER = "__MIFTAH_CDN_ASSET_VERSION__";
const UNRESOLVED_PLACEHOLDER = /__MIFTAH_[A-Z0-9_]+__/;
const VALID_GIT_SHA = /^[0-9a-f]{7,40}$/i;

export interface PwaBuildMetadata {
  readonly appBuildId: string;
  readonly cdnAssetVersion: string;
}

export interface RenderedPwaArtifacts {
  readonly metadata: PwaBuildMetadata;
  readonly pwaConfig: string;
  readonly serviceWorker: string;
}

export interface PwaArtifactChanges {
  readonly changed: boolean;
  readonly pwaConfigChanged: boolean;
  readonly serviceWorkerChanged: boolean;
}

function normalizeBuildId(rawBuildId: string): string {
  const buildId = rawBuildId.trim();
  if (!VALID_GIT_SHA.test(buildId)) {
    throw new Error(`Invalid PWA build id: ${JSON.stringify(buildId)}`);
  }
  return buildId.slice(0, 12);
}

export function resolveAppBuildId(
  environment: Readonly<Record<string, string | undefined>> = process.env,
  readGitHead: () => string = () =>
    execFileSync("git", ["rev-parse", "--verify", "HEAD"], {
      encoding: "utf-8",
    }),
): string {
  const vercelGitSha = environment.VERCEL_GIT_COMMIT_SHA?.trim();
  return normalizeBuildId(vercelGitSha || readGitHead());
}

function replaceRequiredOnce(
  source: string,
  placeholder: string,
  value: string,
): string {
  const first = source.indexOf(placeholder);
  if (first < 0 || first !== source.lastIndexOf(placeholder)) {
    throw new Error(`Expected exactly one ${placeholder} in the SW template`);
  }
  return `${source.slice(0, first)}${value}${source.slice(first + placeholder.length)}`;
}

export function renderServiceWorker(
  template: string,
  metadata: PwaBuildMetadata,
): string {
  let rendered = replaceRequiredOnce(
    template,
    BUILD_PLACEHOLDER,
    metadata.appBuildId,
  );
  rendered = replaceRequiredOnce(
    rendered,
    CDN_PLACEHOLDER,
    metadata.cdnAssetVersion,
  );

  if (UNRESOLVED_PLACEHOLDER.test(rendered)) {
    throw new Error("Rendered service worker still contains a build placeholder");
  }
  if (!rendered.includes(`const BUILD_ID = "${metadata.appBuildId}";`)) {
    throw new Error("Rendered service worker build id verification failed");
  }
  if (
    !rendered.includes(
      `const CDN_ASSET_VERSION = "${metadata.cdnAssetVersion}";`,
    )
  ) {
    throw new Error("Rendered service worker CDN version verification failed");
  }
  return rendered;
}

export function renderPwaArtifacts({
  appBuildId,
  environment = process.env,
  serviceWorkerTemplate,
}: {
  readonly appBuildId: string;
  readonly environment?: PwaConfigEnvironment;
  readonly serviceWorkerTemplate: string;
}): RenderedPwaArtifacts {
  const metadata = {
    appBuildId: normalizeBuildId(appBuildId),
    cdnAssetVersion: MUSHAF_CDN_ASSET_VERSION,
  };
  const config = createPwaConfig(metadata.appBuildId, environment);
  if (config.cdnAssetVersion !== metadata.cdnAssetVersion) {
    throw new Error("PWA config and service worker CDN versions diverged");
  }

  return {
    metadata,
    pwaConfig: JSON.stringify(config, null, 2),
    serviceWorker: renderServiceWorker(serviceWorkerTemplate, metadata),
  };
}

export function detectPwaArtifactChanges(
  current: Pick<RenderedPwaArtifacts, "pwaConfig" | "serviceWorker">,
  next: Pick<RenderedPwaArtifacts, "pwaConfig" | "serviceWorker">,
): PwaArtifactChanges {
  const pwaConfigChanged = current.pwaConfig !== next.pwaConfig;
  const serviceWorkerChanged = current.serviceWorker !== next.serviceWorker;
  return {
    changed: pwaConfigChanged || serviceWorkerChanged,
    pwaConfigChanged,
    serviceWorkerChanged,
  };
}

function writeAtomically(outputPath: string, content: string): void {
  mkdirSync(path.dirname(outputPath), { recursive: true });
  const temporaryPath = `${outputPath}.tmp`;
  writeFileSync(temporaryPath, content, "utf-8");
  renameSync(temporaryPath, outputPath);
}

function readGeneratedArtifact(outputPath: string): string {
  try {
    return readFileSync(outputPath, "utf-8");
  } catch {
    return "";
  }
}

export function writePwaArtifacts(
  rendered: RenderedPwaArtifacts,
  paths: {
    readonly pwaConfig: string;
    readonly serviceWorker: string;
  } = {
    pwaConfig: PWA_CONFIG_OUTPUT_PATH,
    serviceWorker: SW_OUTPUT_PATH,
  },
): PwaArtifactChanges {
  const current = {
    pwaConfig: readGeneratedArtifact(paths.pwaConfig),
    serviceWorker: readGeneratedArtifact(paths.serviceWorker),
  };
  const changes = detectPwaArtifactChanges(current, rendered);

  if (changes.pwaConfigChanged) writeAtomically(paths.pwaConfig, rendered.pwaConfig);
  if (changes.serviceWorkerChanged) {
    writeAtomically(paths.serviceWorker, rendered.serviceWorker);
  }
  return changes;
}

function main(): void {
  const rendered = renderPwaArtifacts({
    appBuildId: resolveAppBuildId(),
    serviceWorkerTemplate: readFileSync(SW_TEMPLATE_PATH, "utf-8"),
  });
  const changes = writePwaArtifacts(rendered);
  console.log(
    `Rendered PWA artifacts (build: ${rendered.metadata.appBuildId}, CDN: ${rendered.metadata.cdnAssetVersion}, changed: ${changes.changed})`,
  );
}

const entryPath = process.argv[1];
if (entryPath && import.meta.url === pathToFileURL(path.resolve(entryPath)).href) {
  main();
}
