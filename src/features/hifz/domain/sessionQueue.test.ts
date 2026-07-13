import test from "node:test";
import assert from "node:assert/strict";
import {
  areAllProgressIdsRated,
  buildRecoveredRatedProgressIds,
  buildQueuePageHref,
  findQueuePageIndex,
  getAdjacentQueuePageFromQueue,
  isPageFullyRated,
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

test("buildRecoveredRatedProgressIds seeds pages before the recovered page", () => {
  const rated = buildRecoveredRatedProgressIds(
    [
      {
        progressId: 11,
        ayahId: 101,
        ayahKey: "2:1",
        pageNumber: 2,
        block: "sabak",
      },
      {
        progressId: 12,
        ayahId: 102,
        ayahKey: "2:2",
        pageNumber: 5,
        block: "sabak",
      },
      {
        progressId: 13,
        ayahId: 103,
        ayahKey: "2:3",
        pageNumber: 9,
        block: "sabak",
      },
    ],
    [2, 5, 9],
    2,
  );

  assert.deepEqual(rated, [11, 12]);
});

test("areAllProgressIdsRated and isPageFullyRated detect already-completed items", () => {
  const ratedQueue: HifzSessionQueue = {
    ...queue,
    items: [
      {
        progressId: 21,
        ayahId: 201,
        ayahKey: "3:1",
        pageNumber: 5,
        block: "sabqi",
      },
      {
        progressId: 22,
        ayahId: 202,
        ayahKey: "3:2",
        pageNumber: 5,
        block: "sabqi",
      },
      {
        progressId: 23,
        ayahId: 203,
        ayahKey: "3:3",
        pageNumber: 9,
        block: "manzil",
      },
    ],
    rated: [21, 22],
  };

  assert.equal(areAllProgressIdsRated(ratedQueue, [21, 22]), true);
  assert.equal(areAllProgressIdsRated(ratedQueue, [21, 23]), false);
  assert.equal(isPageFullyRated(ratedQueue, 5), true);
  assert.equal(isPageFullyRated(ratedQueue, 9), false);
});
