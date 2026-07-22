import assert from "node:assert/strict";
import test from "node:test";
import { fahamQueueRequestSchema, fahamRateRequestSchema } from "./schemas";

test("fahamQueueRequestSchema accepts a meaningLocale of en or ms", () => {
  assert.equal(fahamQueueRequestSchema.parse({ meaningLocale: "en" }).meaningLocale, "en");
  assert.equal(fahamQueueRequestSchema.parse({ meaningLocale: "ms" }).meaningLocale, "ms");
  // meaningLocale is optional — absent is valid.
  assert.equal(fahamQueueRequestSchema.parse({}).meaningLocale, undefined);
});

test("fahamQueueRequestSchema rejects an unknown meaningLocale", () => {
  assert.throws(() => fahamQueueRequestSchema.parse({ meaningLocale: "ar" }));
});

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
