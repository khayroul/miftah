import assert from "node:assert/strict";
import test from "node:test";
import { dedupeAyahIds, resolveMemorizedAyahIds } from "./personalization";

test("dedupes known ayah ids while preserving page order", () => {
  assert.deepEqual(dedupeAyahIds([8, 8, 9]), [8, 9]);
});

test("returns ids only for sabqi and manzil progress", () => {
  const progress = new Map([
    [8, { hifz_status: "sabqi" }],
    [9, { hifz_status: "learning" }],
    [10, { hifz_status: "manzil" }],
  ]);

  assert.deepEqual(resolveMemorizedAyahIds([8, 9, 10], progress), [8, 10]);
});
