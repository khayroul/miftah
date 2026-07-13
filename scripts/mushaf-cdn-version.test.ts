import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createPwaConfig } from "./generate-pwa-config";
import { injectBuildMetadata } from "./inject-build-id";
import { MUSHAF_CDN_ASSET_VERSION } from "../src/mushaf/lib/mushafAssetVersion";
import { getRemotePageImageUrl } from "../src/mushaf/lib/mushafAssets";

describe("canonical Mushaf CDN asset version", () => {
  it("feeds the PWA config generator from the runtime URL version", () => {
    const config = createPwaConfig("build-test", {
      NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co/",
    });

    assert.equal(config.cdnAssetVersion, MUSHAF_CDN_ASSET_VERSION);

    const previousEnabled = process.env.MUSHAF_CDN_ENABLED;
    const previousBase = process.env.MUSHAF_PAGES_BASE_URL;
    try {
      process.env.MUSHAF_CDN_ENABLED = "true";
      process.env.MUSHAF_PAGES_BASE_URL = "https://cdn.example/pages";
      assert.equal(
        getRemotePageImageUrl(1),
        `https://cdn.example/pages/page_001.png?v=${config.cdnAssetVersion}`,
      );
    } finally {
      if (previousEnabled === undefined) delete process.env.MUSHAF_CDN_ENABLED;
      else process.env.MUSHAF_CDN_ENABLED = previousEnabled;
      if (previousBase === undefined) delete process.env.MUSHAF_PAGES_BASE_URL;
      else process.env.MUSHAF_PAGES_BASE_URL = previousBase;
    }
  });

  it("feeds service-worker injection from the same canonical version", () => {
    const injected = injectBuildMetadata(
      'const BUILD_ID = "__BUILD_ID__";\nconst CDN_ASSET_VERSION = "__CDN_ASSET_VERSION__";',
      "abc1234",
    );

    assert.equal(
      injected,
      `const BUILD_ID = "abc1234";\nconst CDN_ASSET_VERSION = "${MUSHAF_CDN_ASSET_VERSION}";`,
    );
  });
});
