import test from "node:test";
import assert from "node:assert/strict";
import {
  findMarkerForPage,
  getMarkerPageById,
  parseBoundedIntegerInput,
} from "./readNavigationUtils";

test("parseBoundedIntegerInput accepts valid bounds", () => {
  assert.equal(parseBoundedIntegerInput("1", 1, 604), 1);
  assert.equal(parseBoundedIntegerInput(" 604 ", 1, 604), 604);
  assert.equal(parseBoundedIntegerInput("030", 1, 604), 30);
});

test("parseBoundedIntegerInput rejects invalid values", () => {
  assert.equal(parseBoundedIntegerInput("", 1, 604), null);
  assert.equal(parseBoundedIntegerInput("0", 1, 604), null);
  assert.equal(parseBoundedIntegerInput("605", 1, 604), null);
  assert.equal(parseBoundedIntegerInput("12.5", 1, 604), null);
  assert.equal(parseBoundedIntegerInput("12abc", 1, 604), null);
});

test("findMarkerForPage resolves active scope by page", () => {
  const markers = [
    { id: 1, page: 1 },
    { id: 2, page: 22 },
    { id: 3, page: 42 },
  ];

  assert.deepEqual(findMarkerForPage(markers, 1), { id: 1, page: 1 });
  assert.deepEqual(findMarkerForPage(markers, 21), { id: 1, page: 1 });
  assert.deepEqual(findMarkerForPage(markers, 22), { id: 2, page: 22 });
  assert.deepEqual(findMarkerForPage(markers, 604), { id: 3, page: 42 });
});

test("getMarkerPageById resolves target page", () => {
  const markers = [
    { id: 1, page: 1 },
    { id: 2, page: 22 },
  ];

  assert.equal(getMarkerPageById(markers, 2), 22);
  assert.equal(getMarkerPageById(markers, 3), null);
});
