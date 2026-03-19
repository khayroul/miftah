import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createEmptyPack, updatePackStatus } from "./packDb.js";

describe("createEmptyPack", () => {
  it("creates a pack with status pending", () => {
    const pack = createEmptyPack(2, [2, 49]);
    assert.equal(pack.status, "pending");
  });

  it("sets surahId correctly", () => {
    const pack = createEmptyPack(2, [2, 49]);
    assert.equal(pack.surahId, 2);
  });

  it("sets pageRange correctly", () => {
    const pack = createEmptyPack(2, [2, 49]);
    assert.deepEqual(pack.pageRange, [2, 49]);
  });

  it("computes totalPages as end - start + 1", () => {
    const pack = createEmptyPack(2, [2, 49]);
    assert.equal(pack.totalPages, 48);
  });

  it("sets downloadedPages to 0", () => {
    const pack = createEmptyPack(2, [2, 49]);
    assert.equal(pack.downloadedPages, 0);
  });

  it("sets downloadedAt to null", () => {
    const pack = createEmptyPack(2, [2, 49]);
    assert.equal(pack.downloadedAt, null);
  });

  it("sets totalSizeBytes to 0", () => {
    const pack = createEmptyPack(2, [2, 49]);
    assert.equal(pack.totalSizeBytes, 0);
  });

  it("sets assetVersion to empty string", () => {
    const pack = createEmptyPack(2, [2, 49]);
    assert.equal(pack.assetVersion, "");
  });

  it("sets errorMessage to null", () => {
    const pack = createEmptyPack(2, [2, 49]);
    assert.equal(pack.errorMessage, null);
  });
});

describe("updatePackStatus", () => {
  it("returns a new object, not the same reference", () => {
    const original = createEmptyPack(2, [2, 49]);
    const updated = updatePackStatus(original, { status: "downloading" });
    assert.notEqual(updated, original);
  });

  it("does not mutate the original pack", () => {
    const original = createEmptyPack(2, [2, 49]);
    const originalStatus = original.status;
    updatePackStatus(original, { status: "downloading" });
    assert.equal(original.status, originalStatus);
  });

  it("applies status update", () => {
    const original = createEmptyPack(2, [2, 49]);
    const updated = updatePackStatus(original, { status: "downloading" });
    assert.equal(updated.status, "downloading");
  });

  it("applies downloadedPages update", () => {
    const original = createEmptyPack(2, [2, 49]);
    const updated = updatePackStatus(original, { downloadedPages: 10 });
    assert.equal(updated.downloadedPages, 10);
  });

  it("applies errorMessage update", () => {
    const original = createEmptyPack(2, [2, 49]);
    const updated = updatePackStatus(original, { status: "error", errorMessage: "Network failure" });
    assert.equal(updated.errorMessage, "Network failure");
  });

  it("preserves unchanged fields", () => {
    const original = createEmptyPack(2, [2, 49]);
    const updated = updatePackStatus(original, { status: "downloading" });
    assert.equal(updated.surahId, original.surahId);
    assert.equal(updated.totalPages, original.totalPages);
    assert.deepEqual(updated.pageRange, original.pageRange);
  });

  it("auto-sets downloadedAt to ISO timestamp when status is complete", () => {
    const before = new Date();
    const original = createEmptyPack(2, [2, 49]);
    const updated = updatePackStatus(original, { status: "complete" });
    const after = new Date();

    assert.notEqual(updated.downloadedAt, null);
    const ts = new Date(updated.downloadedAt as string);
    assert.ok(ts >= before, "downloadedAt should be >= before timestamp");
    assert.ok(ts <= after, "downloadedAt should be <= after timestamp");
  });

  it("does not set downloadedAt when status is not complete", () => {
    const original = createEmptyPack(2, [2, 49]);
    const updated = updatePackStatus(original, { status: "downloading" });
    assert.equal(updated.downloadedAt, null);
  });
});
