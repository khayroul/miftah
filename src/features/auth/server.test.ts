import assert from "node:assert/strict";
import test from "node:test";
import { authenticatedUserFromClaims } from "./server";

test("authenticatedUserFromClaims accepts only a non-empty subject", () => {
  assert.deepEqual(authenticatedUserFromClaims({ sub: "verified-user-id" }), {
    id: "verified-user-id",
  });
  assert.equal(authenticatedUserFromClaims({ sub: "" }), null);
  assert.equal(authenticatedUserFromClaims({ sub: 42 }), null);
  assert.equal(authenticatedUserFromClaims(null), null);
});
