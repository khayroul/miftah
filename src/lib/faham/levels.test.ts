import assert from "node:assert/strict";
import test from "node:test";
import { buildFahamLevelProgress, deriveFahamLevelState } from "./levels";

test("stays on level 1 when level 1 gates are not met", () => {
  const state = deriveFahamLevelState([
    { foundCount: 599, masteredCount: 180, wordLimit: 1000 },
    { foundCount: 1200, masteredCount: 360, wordLimit: 2000 },
    { foundCount: 1800, masteredCount: 540, wordLimit: 3000 },
    { foundCount: 2400, masteredCount: 720, wordLimit: 4000 },
  ]);

  assert.equal(state.activeLevel, 1);
  assert.equal(state.activeWordLimit, 1000);
  assert.equal(state.levels[0]?.unlocked, false);
});

test("unlocks level 2 when level 1 gates are met", () => {
  const state = deriveFahamLevelState([
    { foundCount: 600, masteredCount: 180, wordLimit: 1000 },
    { foundCount: 1199, masteredCount: 360, wordLimit: 2000 },
    { foundCount: 1800, masteredCount: 540, wordLimit: 3000 },
    { foundCount: 2400, masteredCount: 720, wordLimit: 4000 },
  ]);

  assert.equal(state.activeLevel, 2);
  assert.equal(state.activeWordLimit, 2000);
  assert.equal(state.levels[0]?.unlocked, true);
  assert.equal(state.levels[1]?.unlocked, false);
});

test("unlocks level 3 when levels 1 and 2 gates are met", () => {
  const state = deriveFahamLevelState([
    { foundCount: 700, masteredCount: 210, wordLimit: 1000 },
    { foundCount: 1300, masteredCount: 390, wordLimit: 2000 },
    { foundCount: 1799, masteredCount: 540, wordLimit: 3000 },
    { foundCount: 2400, masteredCount: 720, wordLimit: 4000 },
  ]);

  assert.equal(state.activeLevel, 3);
  assert.equal(state.activeWordLimit, 3000);
  assert.equal(state.levels[0]?.unlocked, true);
  assert.equal(state.levels[1]?.unlocked, true);
  assert.equal(state.levels[2]?.unlocked, false);
});

test("unlocks level 4 when levels 1, 2, and 3 gates are met", () => {
  const state = deriveFahamLevelState([
    { foundCount: 700, masteredCount: 210, wordLimit: 1000 },
    { foundCount: 1300, masteredCount: 390, wordLimit: 2000 },
    { foundCount: 1800, masteredCount: 540, wordLimit: 3000 },
    { foundCount: 2400, masteredCount: 720, wordLimit: 4000 },
  ]);

  assert.equal(state.activeLevel, 4);
  assert.equal(state.activeWordLimit, 4000);
  assert.equal(state.levels[0]?.unlocked, true);
  assert.equal(state.levels[1]?.unlocked, true);
  assert.equal(state.levels[2]?.unlocked, true);
});

test("mastered target is derived from found count", () => {
  const state = deriveFahamLevelState([
    { foundCount: 601, masteredCount: 180, wordLimit: 1000 },
  ]);

  assert.equal(state.levels[0]?.foundRequired, 600);
  assert.equal(state.levels[0]?.masteredRequired, 181);
  assert.equal(state.levels[0]?.unlocked, false);
});

test("progress payload points to next unlock requirements", () => {
  const state = deriveFahamLevelState([
    { foundCount: 700, masteredCount: 210, wordLimit: 1000 },
    { foundCount: 1300, masteredCount: 300, wordLimit: 2000 },
    { foundCount: 1800, masteredCount: 540, wordLimit: 3000 },
    { foundCount: 2200, masteredCount: 660, wordLimit: 4000 },
  ]);
  const progress = buildFahamLevelProgress(state);

  assert.equal(progress.activeLevel, 2);
  assert.equal(progress.nextLevel, 3);
  assert.equal(progress.nextWordLimit, 3000);
  assert.equal(progress.unlockFoundRequired, 1200);
  assert.equal(progress.unlockMasteredRequired, 390);
  assert.equal(progress.unlockFoundProgress, 1200);
  assert.equal(progress.unlockMasteredProgress, 300);
  assert.equal(progress.unlockReady, false);
  assert.equal(progress.lemmaUnlocked, false);
});

test("lemma is unlocked at level 4", () => {
  const state = deriveFahamLevelState([
    { foundCount: 700, masteredCount: 210, wordLimit: 1000 },
    { foundCount: 1300, masteredCount: 390, wordLimit: 2000 },
    { foundCount: 1800, masteredCount: 540, wordLimit: 3000 },
    { foundCount: 2400, masteredCount: 720, wordLimit: 4000 },
  ]);
  const progress = buildFahamLevelProgress(state);

  assert.equal(progress.activeLevel, 4);
  assert.equal(progress.lemmaUnlocked, true);
});
