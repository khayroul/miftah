import assert from "node:assert/strict";
import test from "node:test";
import { appendSessionCookies } from "./supabase-auth-server";

test("appendSessionCookies retains cookies from every Supabase setAll batch", () => {
  const firstBatch = [{ name: "sb-access-token", value: "access", options: { path: "/" } }];
  const secondBatch = [{ name: "sb-refresh-token", value: "refresh", options: { path: "/" } }];

  const cookies = appendSessionCookies(firstBatch, secondBatch);

  assert.deepEqual(cookies, [...firstBatch, ...secondBatch]);
});
