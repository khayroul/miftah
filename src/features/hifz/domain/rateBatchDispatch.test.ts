import test from "node:test";
import assert from "node:assert/strict";
import { dispatchGroupedByKey } from "./rateBatchDispatch";

/** Deterministic-but-out-of-order microtask delay for exercising concurrency. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("dispatchGroupedByKey preserves input order in the results array regardless of completion order", async () => {
  const items = [
    { id: "a", delayMs: 15 },
    { id: "b", delayMs: 5 },
    { id: "c", delayMs: 10 },
  ];

  const results = await dispatchGroupedByKey(
    items,
    (item) => item.id,
    async (item) => {
      await delay(item.delayMs);
      return item.id;
    },
  );

  // Even though "b" resolves first and "a" resolves last, the results array
  // is written by original index, so order always mirrors the input.
  assert.deepEqual(results, ["a", "b", "c"]);
});

test("dispatchGroupedByKey runs distinct keys concurrently, not serially", async () => {
  let inFlight = 0;
  let maxInFlight = 0;
  const items = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];

  await dispatchGroupedByKey(
    items,
    (item) => item.id,
    async (item) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await delay(10);
      inFlight -= 1;
      return item.id;
    },
  );

  // A strictly-serial for-loop could never have more than 1 in flight at
  // once. Distinct-key entries must overlap.
  assert.ok(
    maxInFlight > 1,
    `expected distinct-key entries to overlap, saw max concurrency ${maxInFlight}`,
  );
});

test("dispatchGroupedByKey replays same-key entries strictly sequentially, in order — the rate-batch idempotency contract", async () => {
  // Simulates the exact shape rate-batch relies on: a fake "row" keyed by
  // progressId with a last_review timestamp. apply() mimics
  // applyRatingEntry's guard: if the row was "reviewed" within the dedup
  // window, return {ok:true, deduped:true}; otherwise "write" a new
  // last_review and return {ok:true}. Two same-key entries submitted
  // together must behave exactly like the old serial for-loop: the first
  // applies for real, the second observes the first's write and dedupes —
  // never both applying (which would be the double-apply the RF-2 guard
  // exists to prevent).
  const REVIEW_DEDUP_WINDOW_MS = 30_000;
  const now = new Date();
  const rows = new Map<number, { lastReview: string | null }>([
    [42, { lastReview: null }],
  ]);

  type Entry = { progressId: number; rating: 1 | 3 };
  type Result = { progressId: number; ok: boolean; deduped?: boolean };

  const applyOrder: number[] = [];

  async function fakeApplyRatingEntry(entry: Entry, index: number): Promise<Result> {
    // Simulate a DB round-trip: yield the microtask queue so a genuinely
    // parallel (ungrouped) implementation would interleave these.
    await delay(index === 0 ? 5 : 1);

    const row = rows.get(entry.progressId);
    if (!row) return { progressId: entry.progressId, ok: false };

    if (
      row.lastReview &&
      Math.abs(now.getTime() - Date.parse(row.lastReview)) < REVIEW_DEDUP_WINDOW_MS
    ) {
      return { progressId: entry.progressId, ok: true, deduped: true };
    }

    applyOrder.push(index);
    row.lastReview = now.toISOString();
    return { progressId: entry.progressId, ok: true };
  }

  // Two entries targeting the SAME progressId in one batch (a duplicate the
  // API layer doesn't reject) — the defense-in-depth case this grouping
  // exists for.
  const entries: Entry[] = [
    { progressId: 42, rating: 3 },
    { progressId: 42, rating: 3 },
  ];

  const results = await dispatchGroupedByKey(
    entries,
    (entry) => entry.progressId,
    fakeApplyRatingEntry,
  );

  assert.deepEqual(results, [
    { progressId: 42, ok: true },
    { progressId: 42, ok: true, deduped: true },
  ]);
  // Only the first entry actually "applied" the rating — the second's
  // dedup guard fired against the first's write, exactly as the old
  // sequential for-loop guaranteed.
  assert.deepEqual(applyOrder, [0]);
});

test("dispatchGroupedByKey per-entry ok/fail is independent — one entry's failure result does not affect others", async () => {
  type Entry = { progressId: number; shouldFail: boolean };
  type Result = { progressId: number; ok: boolean };

  const entries: Entry[] = [
    { progressId: 1, shouldFail: false },
    { progressId: 2, shouldFail: true },
    { progressId: 3, shouldFail: false },
  ];

  const results = await dispatchGroupedByKey(
    entries,
    (entry) => entry.progressId,
    async (entry): Promise<Result> => {
      await delay(1);
      // Mirrors applyRatingEntry's internal try/catch: failures resolve to
      // {ok:false}, never reject the promise.
      if (entry.shouldFail) {
        return { progressId: entry.progressId, ok: false };
      }
      return { progressId: entry.progressId, ok: true };
    },
  );

  assert.deepEqual(results, [
    { progressId: 1, ok: true },
    { progressId: 2, ok: false },
    { progressId: 3, ok: true },
  ]);
});
