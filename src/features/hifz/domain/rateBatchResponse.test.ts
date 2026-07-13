import assert from "node:assert/strict";
import test from "node:test";
import { isCompleteRateBatchResponse } from "./rateBatchResponse";

test("accepts one successful result for every expected progress ID", () => {
  assert.equal(
    isCompleteRateBatchResponse(
      true,
      { ok: true, results: [{ ok: true, progressId: 7 }, { ok: true, progressId: 8 }] },
      [7, 8],
    ),
    true,
  );
});

test("rejects HTTP failure, missing results, and failed entries", () => {
  assert.equal(isCompleteRateBatchResponse(false, { ok: true, results: [] }, []), false);
  assert.equal(isCompleteRateBatchResponse(true, { ok: true }, [7]), false);
  assert.equal(
    isCompleteRateBatchResponse(true, { ok: true, results: [{ ok: false, progressId: 7 }] }, [7]),
    false,
  );
});

test("rejects missing, unexpected, or duplicate result IDs", () => {
  assert.equal(
    isCompleteRateBatchResponse(true, { ok: true, results: [{ ok: true, progressId: 7 }] }, [7, 8]),
    false,
  );
  assert.equal(
    isCompleteRateBatchResponse(true, { ok: true, results: [{ ok: true, progressId: 9 }] }, [7]),
    false,
  );
  assert.equal(
    isCompleteRateBatchResponse(
      true,
      { ok: true, results: [{ ok: true, progressId: 7 }, { ok: true, progressId: 7 }] },
      [7, 8],
    ),
    false,
  );
});
