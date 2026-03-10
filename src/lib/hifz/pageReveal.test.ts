import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateHifzRevealStageByAyahKeys,
  resolveApproxThirdBoundariesByAyahEnd,
} from "./pageReveal";

test("resolveApproxThirdBoundariesByAyahEnd prefers ayah end at or below target", () => {
  const { firstBoundaryY, secondBoundaryY } =
    resolveApproxThirdBoundariesByAyahEnd([800, 1400, 2200], 3000);

  // 1/3 target = 1000 => choose 800, not 1400.
  assert.equal(firstBoundaryY, 800);
  // 2/3 target = 2000 => choose 1400 (closest at/below target with progression).
  assert.equal(secondBoundaryY, 1400);
});

test("resolveApproxThirdBoundariesByAyahEnd keeps progression when sparse ayah endings", () => {
  const { firstBoundaryY, secondBoundaryY } =
    resolveApproxThirdBoundariesByAyahEnd([900], 3000);

  assert.equal(firstBoundaryY, 900);
  assert.equal(secondBoundaryY, 900);
});

test("resolveApproxThirdBoundariesByAyahEnd falls back safely when no endings", () => {
  const { firstBoundaryY, secondBoundaryY } =
    resolveApproxThirdBoundariesByAyahEnd([], 3000);

  assert.equal(firstBoundaryY, 3000);
  assert.equal(secondBoundaryY, 3000);
});

test("calculateHifzRevealStageByAyahKeys returns expected staged progression", () => {
  const first = ["2:1", "2:2"];
  const second = ["2:3", "2:4"];

  assert.equal(
    calculateHifzRevealStageByAyahKeys(first, second, new Set<string>()),
    1,
  );
  assert.equal(
    calculateHifzRevealStageByAyahKeys(first, second, new Set<string>(first)),
    2,
  );
  assert.equal(
    calculateHifzRevealStageByAyahKeys(
      first,
      second,
      new Set<string>([...first, ...second]),
    ),
    3,
  );
});
