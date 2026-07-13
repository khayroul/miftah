import test from "node:test";
import assert from "node:assert/strict";
import { FALLBACK_READ_JUMP_TARGETS } from "./readJumpTargetsFallback";

test("fallback jump targets include complete surah and juz lists", () => {
  assert.equal(FALLBACK_READ_JUMP_TARGETS.surahs.length, 114);
  assert.equal(FALLBACK_READ_JUMP_TARGETS.juzs.length, 30);
});

test("fallback jump targets map known boundaries correctly", () => {
  assert.equal(FALLBACK_READ_JUMP_TARGETS.surahs[0]?.page, 1);
  assert.equal(FALLBACK_READ_JUMP_TARGETS.surahs[113]?.page, 604);
  assert.equal(FALLBACK_READ_JUMP_TARGETS.juzs[0]?.page, 1);
  assert.equal(FALLBACK_READ_JUMP_TARGETS.juzs[29]?.page, 582);
});
