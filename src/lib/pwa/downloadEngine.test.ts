import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildPageAssetUrls, type PwaConfig } from "./downloadEngine";

const TEST_CONFIG: PwaConfig = {
  cdnAssetVersion: "4",
  supabaseStorageBase: "https://cdn.example.com/storage/v1/object/public",
  pagesBucket: "mushaf-pages",
  manifestsBucket: "mushaf-manifests",
};

const FALLBACK_CONFIG: PwaConfig = {
  cdnAssetVersion: "4",
  supabaseStorageBase: "",
  pagesBucket: "mushaf-pages",
  manifestsBucket: "mushaf-manifests",
};

describe("buildPageAssetUrls", () => {
  it("page 1 — correct URLs with zero-padded page number", () => {
    const urls = buildPageAssetUrls(1, TEST_CONFIG);

    assert.equal(
      urls.webp,
      "https://cdn.example.com/storage/v1/object/public/mushaf-pages/page_001_mobile.webp?v=4",
    );
    assert.equal(
      urls.manifest,
      "https://cdn.example.com/storage/v1/object/public/mushaf-manifests/page_001.manifest.json?v=4",
    );
    assert.equal(urls.layout, "/layouts/page-001.json");
    assert.equal(urls.translation, "/translations/page-001.json");
  });

  it("page 42 — proper zero-padding in all URLs", () => {
    const urls = buildPageAssetUrls(42, TEST_CONFIG);

    assert.ok(
      urls.webp.includes("page_042_mobile.webp?v=4"),
      `webp should include page_042_mobile.webp?v=4, got: ${urls.webp}`,
    );
    assert.ok(
      urls.manifest.includes("page_042.manifest.json?v=4"),
      `manifest should include page_042.manifest.json?v=4, got: ${urls.manifest}`,
    );
    assert.equal(urls.layout, "/layouts/page-042.json");
    assert.equal(urls.translation, "/translations/page-042.json");
  });

  it("page 100 — three-digit page number (no padding needed)", () => {
    const urls = buildPageAssetUrls(100, TEST_CONFIG);

    assert.ok(urls.webp.includes("page_100_mobile.webp"));
    assert.ok(urls.manifest.includes("page_100.manifest.json"));
    assert.equal(urls.layout, "/layouts/page-100.json");
    assert.equal(urls.translation, "/translations/page-100.json");
  });

  it("page 604 — last page of mushaf", () => {
    const urls = buildPageAssetUrls(604, TEST_CONFIG);

    assert.ok(urls.webp.includes("page_604_mobile.webp"));
    assert.ok(urls.manifest.includes("page_604.manifest.json"));
    assert.equal(urls.layout, "/layouts/page-604.json");
    assert.equal(urls.translation, "/translations/page-604.json");
  });

  it("webp and manifest use underscore separator, layout and translation use dash", () => {
    const urls = buildPageAssetUrls(5, TEST_CONFIG);

    assert.ok(urls.webp.includes("page_005"), "webp must use underscore");
    assert.ok(urls.manifest.includes("page_005"), "manifest must use underscore");
    assert.ok(urls.layout.includes("page-005"), "layout must use dash");
    assert.ok(urls.translation.includes("page-005"), "translation must use dash");
  });

  it("asset version is appended to remote URLs only", () => {
    const urls = buildPageAssetUrls(1, TEST_CONFIG);

    assert.ok(urls.webp.includes("?v=4"), "webp must have version param");
    assert.ok(urls.manifest.includes("?v=4"), "manifest must have version param");
    assert.equal(
      urls.layout.includes("?v="),
      false,
      "layout (local) must NOT have version param",
    );
    assert.equal(
      urls.translation.includes("?v="),
      false,
      "translation (local) must NOT have version param",
    );
  });

  it("falls back to local API routes when supabaseStorageBase is empty", () => {
    const urls = buildPageAssetUrls(7, FALLBACK_CONFIG);

    assert.equal(urls.webp, "/api/mushaf/page/7?variant=mobile");
    assert.equal(urls.manifest, "/api/mushaf/manifest/7");
    assert.equal(urls.layout, "/layouts/page-007.json");
    assert.equal(urls.translation, "/translations/page-007.json");
  });
});
