import assert from "node:assert/strict";
import test from "node:test";
import {
  EXPOSURE_DEDUP_WINDOW_MS,
  REVIEW_DEDUP_WINDOW_MS,
  isRecentExposure,
  isRecentlyReviewed,
  isUniqueViolation,
  isWithinWindow,
} from "./idempotency";

const NOW = new Date("2026-07-13T12:00:00.000Z");

test("isWithinWindow: null timestamp is never within window (never-reviewed cards)", () => {
  assert.equal(isWithinWindow(null, NOW, 30_000), false);
});

test("isWithinWindow: invalid timestamp is never within window", () => {
  assert.equal(isWithinWindow("not-a-date", NOW, 30_000), false);
});

test("isWithinWindow: timestamp inside the window is detected", () => {
  const tenSecondsAgo = new Date(NOW.getTime() - 10_000).toISOString();
  assert.equal(isWithinWindow(tenSecondsAgo, NOW, 30_000), true);
});

test("isWithinWindow: timestamp outside the window is not detected", () => {
  const oneHourAgo = new Date(NOW.getTime() - 60 * 60 * 1000).toISOString();
  assert.equal(isWithinWindow(oneHourAgo, NOW, 30_000), false);
});

test("isWithinWindow: a just-written future timestamp (minor clock skew) is treated as recent", () => {
  const slightFuture = new Date(NOW.getTime() + 500).toISOString();
  assert.equal(isWithinWindow(slightFuture, NOW, 30_000), true);
});

test("B1: a correct-answer double-submit within the review window is a duplicate", () => {
  // Card was rated one second ago; the re-entrant / retried POST arrives now.
  const oneSecondAgo = new Date(NOW.getTime() - 1_000).toISOString();
  assert.equal(isRecentlyReviewed(oneSecondAgo, NOW), true);
});

test("B1: a legitimate re-review a day later is NOT a duplicate", () => {
  const yesterday = new Date(NOW.getTime() - 24 * 60 * 60 * 1000).toISOString();
  assert.equal(isRecentlyReviewed(yesterday, NOW), false);
});

test("B1: a brand-new card (last_review = null) is never a duplicate on first rating", () => {
  assert.equal(isRecentlyReviewed(null, NOW), false);
});

test("B6: an exposure event recorded moments ago is a recent duplicate", () => {
  const fiveSecondsAgo = new Date(NOW.getTime() - 5_000).toISOString();
  assert.equal(isRecentExposure(fiveSecondsAgo, NOW), true);
});

test("B6: a stale exposure event outside the window is not a duplicate", () => {
  const longAgo = new Date(NOW.getTime() - EXPOSURE_DEDUP_WINDOW_MS - 10_000).toISOString();
  assert.equal(isRecentExposure(longAgo, NOW), false);
});

test("windows are positive, small, and well under the shortest FSRS re-review interval", () => {
  assert.ok(REVIEW_DEDUP_WINDOW_MS > 0 && REVIEW_DEDUP_WINDOW_MS <= 60_000);
  assert.ok(EXPOSURE_DEDUP_WINDOW_MS > 0 && EXPOSURE_DEDUP_WINDOW_MS <= 120_000);
});

test("B8: a Postgres unique-violation error (code 23505) is recognised", () => {
  assert.equal(isUniqueViolation({ code: "23505", message: "duplicate key" }), true);
});

test("B8: a non-unique-violation error is not misclassified", () => {
  assert.equal(isUniqueViolation({ code: "23503", message: "fk violation" }), false);
  assert.equal(isUniqueViolation(new Error("boom")), false);
  assert.equal(isUniqueViolation(null), false);
  assert.equal(isUniqueViolation("23505"), false);
});
