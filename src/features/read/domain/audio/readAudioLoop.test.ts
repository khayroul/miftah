import test from "node:test";
import assert from "node:assert/strict";
import { resolveReadAudioLoopAction } from "./readAudioLoop";

test("repeats the same ayah when verse repeat is infinite", () => {
  const result = resolveReadAudioLoopAction({
    currentIndex: 4,
    rangeStartIndex: 2,
    rangeEndIndex: 6,
    repeatEachVerse: -1,
    repeatSet: 1,
    repeatEachStep: 0,
    repeatSetStep: 0,
  });

  assert.deepEqual(result, {
    type: "replay-current",
    nextRepeatEachStep: 0,
    nextRepeatSetStep: 0,
  });
});

test("restarts a single-ayah range when set repeat is enabled", () => {
  const result = resolveReadAudioLoopAction({
    currentIndex: 3,
    rangeStartIndex: 3,
    rangeEndIndex: 3,
    repeatEachVerse: 1,
    repeatSet: 3,
    repeatEachStep: 0,
    repeatSetStep: 0,
  });

  assert.deepEqual(result, {
    type: "replay-current",
    nextRepeatEachStep: 0,
    nextRepeatSetStep: 1,
  });
});

test("jumps back to the range start when a multi-ayah set repeats", () => {
  const result = resolveReadAudioLoopAction({
    currentIndex: 5,
    rangeStartIndex: 2,
    rangeEndIndex: 5,
    repeatEachVerse: 1,
    repeatSet: 2,
    repeatEachStep: 0,
    repeatSetStep: 0,
  });

  assert.deepEqual(result, {
    type: "play-index",
    nextIndex: 2,
    nextRepeatEachStep: 0,
    nextRepeatSetStep: 1,
  });
});

test("stops after the configured set repeats are exhausted", () => {
  const result = resolveReadAudioLoopAction({
    currentIndex: 5,
    rangeStartIndex: 2,
    rangeEndIndex: 5,
    repeatEachVerse: 1,
    repeatSet: 2,
    repeatEachStep: 0,
    repeatSetStep: 1,
  });

  assert.deepEqual(result, {
    type: "stop",
    nextRepeatEachStep: 0,
    nextRepeatSetStep: 0,
  });
});
