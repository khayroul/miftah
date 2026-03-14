import test from "node:test";
import assert from "node:assert/strict";
import {
  buildQueuePageHref,
  findQueuePageIndex,
  getAdjacentQueuePageFromQueue,
  type HifzSessionQueue,
} from "./sessionQueue";

const queue: HifzSessionQueue = {
  type: "memorize",
  items: [],
  pageOrder: [2, 5, 9],
  currentPageIndex: 0,
  rated: [],
};

test("findQueuePageIndex returns the queue position for a page", () => {
  assert.equal(findQueuePageIndex(queue, 5), 1);
  assert.equal(findQueuePageIndex(queue, 77), -1);
});

test("getAdjacentQueuePageFromQueue returns previous and next queue pages", () => {
  assert.deepEqual(getAdjacentQueuePageFromQueue(queue, 5, -1), {
    index: 0,
    pageNumber: 2,
  });
  assert.deepEqual(getAdjacentQueuePageFromQueue(queue, 5, 1), {
    index: 2,
    pageNumber: 9,
  });
  assert.equal(getAdjacentQueuePageFromQueue(queue, 2, -1), null);
  assert.equal(getAdjacentQueuePageFromQueue(queue, 9, 1), null);
});

test("buildQueuePageHref preserves the hifz flow and queue index", () => {
  assert.equal(buildQueuePageHref("review", 42, 3), "/read/42?flow=review&qi=3");
});
