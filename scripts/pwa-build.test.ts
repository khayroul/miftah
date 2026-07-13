import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import {
  SW_TEMPLATE_PATH,
  detectPwaArtifactChanges,
  renderPwaArtifacts,
  renderServiceWorker,
  resolveAppBuildId,
  writePwaArtifacts,
} from "./render-pwa-artifacts";
import { MUSHAF_CDN_ASSET_VERSION } from "../src/mushaf/lib/mushafAssetVersion";

const temporaryDirectories: string[] = [];
const template = readFileSync(SW_TEMPLATE_PATH, "utf-8");
const environment = {
  NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co/",
};

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

function render(appBuildId: string) {
  return renderPwaArtifacts({
    appBuildId,
    environment,
    serviceWorkerTemplate: template,
  });
}

describe("repeat-safe PWA artifact rendering", () => {
  it("renders SW and config from one build metadata value with no placeholders", () => {
    const rendered = render("abc1234");
    const config = JSON.parse(rendered.pwaConfig) as Record<string, unknown>;

    assert.equal(config.appBuildId, "abc1234");
    assert.equal(config.cdnAssetVersion, MUSHAF_CDN_ASSET_VERSION);
    assert.match(rendered.serviceWorker, /const BUILD_ID = "abc1234";/);
    assert.match(
      rendered.serviceWorker,
      new RegExp(`const CDN_ASSET_VERSION = "${MUSHAF_CDN_ASSET_VERSION}";`),
    );
    assert.doesNotMatch(rendered.serviceWorker, /__MIFTAH_[A-Z0-9_]+__/);
  });

  it("detects a repeated render as a no-op and a build change in both outputs", () => {
    const first = render("abc1234");
    const repeated = render("abc1234");
    const changed = render("def5678");

    assert.deepEqual(detectPwaArtifactChanges(first, repeated), {
      changed: false,
      pwaConfigChanged: false,
      serviceWorkerChanged: false,
    });
    assert.deepEqual(detectPwaArtifactChanges(first, changed), {
      changed: true,
      pwaConfigChanged: true,
      serviceWorkerChanged: true,
    });
  });

  it("writes both generated outputs repeat-safely from the pristine template", () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "miftah-pwa-render-"));
    temporaryDirectories.push(directory);
    const paths = {
      pwaConfig: path.join(directory, "pwa-config.json"),
      serviceWorker: path.join(directory, "sw.js"),
    };

    assert.equal(writePwaArtifacts(render("abc1234"), paths).changed, true);
    assert.equal(writePwaArtifacts(render("abc1234"), paths).changed, false);
    assert.equal(writePwaArtifacts(render("def5678"), paths).changed, true);
    assert.match(readFileSync(paths.serviceWorker, "utf-8"), /BUILD_ID = "def5678"/);
    assert.equal(
      JSON.parse(readFileSync(paths.pwaConfig, "utf-8")).appBuildId,
      "def5678",
    );
  });

  it("fails closed for invalid ids, missing placeholders, and silent defaults", () => {
    assert.throws(() => resolveAppBuildId({}, () => "unknown"), /Invalid PWA build id/);
    assert.throws(
      () => resolveAppBuildId({ VERCEL_GIT_COMMIT_SHA: "timestamp-like" }, () => "abc1234"),
      /Invalid PWA build id/,
    );
    assert.throws(
      () => renderServiceWorker(template.replace("__MIFTAH_BUILD_ID__", "missing"), {
        appBuildId: "abc1234",
        cdnAssetVersion: MUSHAF_CDN_ASSET_VERSION,
      }),
      /Expected exactly one __MIFTAH_BUILD_ID__/,
    );
  });
});
