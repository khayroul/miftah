import assert from "node:assert/strict";
import test from "node:test";
import { fahamRateRequestSchema } from "./schemas";

test("fahamRateRequestSchema accepts progressId payload", () => {
  const parsed = fahamRateRequestSchema.parse({
    progressId: 77,
    rating: 3,
  });
  assert.ok("progressId" in parsed);
  assert.equal(parsed.progressId, 77);
});

test("fahamRateRequestSchema accepts wordId payload", () => {
  const parsed = fahamRateRequestSchema.parse({
    rating: 1,
    wordId: 42,
  });
  assert.ok("wordId" in parsed);
  assert.equal(parsed.wordId, 42);
});

test("fahamRateRequestSchema rejects payload without progressId or wordId", () => {
  assert.throws(() => {
    fahamRateRequestSchema.parse({
      rating: 4,
    });
  });
});
