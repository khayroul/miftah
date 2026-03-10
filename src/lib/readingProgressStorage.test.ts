import test from "node:test";
import assert from "node:assert/strict";
import {
  sanitizeReadingProgressState,
  isPageBookmarked,
} from "./readingProgressStorage";

test("sanitizeReadingProgressState returns defaults for invalid input", () => {
  assert.deepEqual(sanitizeReadingProgressState(null), {
    lastPage: null,
    lastReadAt: null,
    bookmarks: [],
  });
});

test("sanitizeReadingProgressState keeps valid fields only", () => {
  const parsed = sanitizeReadingProgressState({
    lastPage: 586,
    lastReadAt: "2026-03-10T00:00:00.000Z",
    bookmarks: [
      { page: 586, createdAt: "2026-03-10T00:00:00.000Z" },
      { page: 586, createdAt: "2026-03-09T00:00:00.000Z" },
      { page: 700, createdAt: "2026-03-08T00:00:00.000Z" },
      { page: 589, createdAt: "2026-03-11T00:00:00.000Z" },
    ],
  });

  assert.equal(parsed.lastPage, 586);
  assert.equal(parsed.bookmarks.length, 2);
  assert.equal(parsed.bookmarks[0]?.page, 589);
  assert.equal(parsed.bookmarks[1]?.page, 586);
});

test("isPageBookmarked checks bookmark presence", () => {
  const state = sanitizeReadingProgressState({
    bookmarks: [{ page: 2, createdAt: "2026-03-10T00:00:00.000Z" }],
  });

  assert.equal(isPageBookmarked(state, 2), true);
  assert.equal(isPageBookmarked(state, 3), false);
});
