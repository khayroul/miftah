import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest, NextResponse } from "next/server";
import { appendSessionCookies } from "./auth-server";

test("appendSessionCookies retains cookies from every Supabase setAll batch", () => {
  const firstBatch = [{ name: "sb-access-token", value: "access", options: { path: "/" } }];
  const secondBatch = [{ name: "sb-refresh-token", value: "refresh", options: { path: "/" } }];

  const cookies = appendSessionCookies(firstBatch, secondBatch);

  assert.deepEqual(cookies, [...firstBatch, ...secondBatch]);
});

test("forwards a refreshed request cookie to downstream handlers", () => {
  const request = new NextRequest("https://miftah.test/api/feedback", {
    headers: { cookie: "sb-project-auth-token=expired-token; theme=night" },
  });

  request.cookies.set("sb-project-auth-token", "rotated-token");
  const response = NextResponse.next({
    request: { headers: new Headers(request.headers) },
  });

  assert.equal(
    response.headers.get("x-middleware-request-cookie"),
    "sb-project-auth-token=rotated-token; theme=night",
  );
});
