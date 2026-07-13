import assert from "node:assert/strict";
import test from "node:test";
import { buildExposureRowEventId } from "@/data/repositories/faham";
import { isUniqueViolation } from "./idempotency";

// B6 (RF-2 follow-up): vocab_exposure_events gains a per-event id so a network
// retry is a true no-op. These tests pin the two properties that make that work:
//   1. the per-row event id is STABLE across retries (same base id -> same row
//      id), so the (user_id, event_id) unique index rejects the retried insert;
//   2. distinct words of one event get DISTINCT ids, so they coexist.

test("B6: same base event id + same word yields an identical row id (retry no-op)", () => {
  const first = buildExposureRowEventId("evt_abc123", 4517);
  const retry = buildExposureRowEventId("evt_abc123", 4517);

  assert.equal(first, "evt_abc123#4517");
  assert.equal(retry, first, "a retried event must regenerate the same row id");
});

test("B6: distinct words of one event get distinct ids (rows coexist under the unique index)", () => {
  const a = buildExposureRowEventId("evt_abc123", 4517);
  const b = buildExposureRowEventId("evt_abc123", 8842);

  assert.equal(a, "evt_abc123#4517");
  assert.equal(b, "evt_abc123#8842");
  assert.notEqual(a, b);
});

test("B6: a different event id produces a different row id (genuine re-exposure inserts)", () => {
  const first = buildExposureRowEventId("evt_abc123", 4517);
  const second = buildExposureRowEventId("evt_def456", 4517);

  assert.notEqual(first, second);
});

test("B6: legacy clients with no event id fall back to null (window-guarded path)", () => {
  assert.equal(buildExposureRowEventId(null, 4517), null);
  assert.equal(buildExposureRowEventId(undefined, 4517), null);
  assert.equal(buildExposureRowEventId("", 4517), null);
});

test("B6: a 23505 unique_violation on the retried insert is recognised as the dedup signal", () => {
  // The repository catches this and returns { deduped: true } instead of a 500.
  assert.equal(isUniqueViolation({ code: "23505" }), true);
  assert.equal(isUniqueViolation({ code: "23502" }), false);
  assert.equal(isUniqueViolation(new Error("boom")), false);
});
