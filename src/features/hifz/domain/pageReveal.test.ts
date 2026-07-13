import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateHifzRevealStageByAyahKeys,
  resolveApproxThirdBoundariesByAyahEnd,
} from "./pageReveal";

test("resolveApproxThirdBoundariesByAyahEnd snaps to nearest ayah end by line distance", () => {
  const { firstBoundaryY, secondBoundaryY } =
    resolveApproxThirdBoundariesByAyahEnd(
      [
        { bottomY: 450, linePosition: 4.5 },
        { bottomY: 600, linePosition: 6.0 },
        { bottomY: 1050, linePosition: 10.5 },
      ],
      15,
      3000,
    );

  // 1/3 target = line 5 => choose 4.5 (closer than 6.0).
  assert.equal(firstBoundaryY, 450);
  // 2/3 target = line 10 => choose 10.5.
  assert.equal(secondBoundaryY, 1050);
});

test("resolveApproxThirdBoundariesByAyahEnd can pick above target when closer", () => {
  const { firstBoundaryY, secondBoundaryY } =
    resolveApproxThirdBoundariesByAyahEnd(
      [
        { bottomY: 400, linePosition: 4.0 },
        { bottomY: 550, linePosition: 5.5 },
        { bottomY: 900, linePosition: 9.0 },
      ],
      15,
      3000,
    );

  // 1/3 target = line 5 => choose 5.5 (closer than 4.0).
  assert.equal(firstBoundaryY, 550);
  // 2/3 target = line 10 => nearest available with progression is 9.0.
  assert.equal(secondBoundaryY, 900);
});

test("resolveApproxThirdBoundariesByAyahEnd falls back safely when no endings", () => {
  const { firstBoundaryY, secondBoundaryY } =
    resolveApproxThirdBoundariesByAyahEnd([], 15, 3000);

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
