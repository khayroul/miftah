import test from "node:test";
import assert from "node:assert/strict";
import { isOfflinePageAvailable } from "./offlinePageData";

test("isOfflinePageAvailable returns false for 0", () => {
  assert.equal(isOfflinePageAvailable(0), false);
});

test("isOfflinePageAvailable returns false for -1", () => {
  assert.equal(isOfflinePageAvailable(-1), false);
});

test("isOfflinePageAvailable returns false for 605", () => {
  assert.equal(isOfflinePageAvailable(605), false);
});

test("isOfflinePageAvailable returns false for NaN", () => {
  assert.equal(isOfflinePageAvailable(NaN), false);
});

test("isOfflinePageAvailable returns false for 1.5", () => {
  assert.equal(isOfflinePageAvailable(1.5), false);
});

test("isOfflinePageAvailable returns true for 1", () => {
  assert.equal(isOfflinePageAvailable(1), true);
});

test("isOfflinePageAvailable returns true for 604", () => {
  assert.equal(isOfflinePageAvailable(604), true);
});

test("isOfflinePageAvailable returns true for 300", () => {
  assert.equal(isOfflinePageAvailable(300), true);
});
