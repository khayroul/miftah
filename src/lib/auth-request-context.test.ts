import assert from "node:assert/strict";
import test from "node:test";
import { NextResponse } from "next/server";
import {
  AUTHENTICATED_USER_ID_HEADER,
  buildAuthenticatedRequestHeaders,
  buildRateLimitedResponse,
} from "./auth-request-context";

test("buildAuthenticatedRequestHeaders removes a client-supplied identity when no user was verified", () => {
  const headers = buildAuthenticatedRequestHeaders(
    new Headers([[AUTHENTICATED_USER_ID_HEADER, "attacker-controlled-user-id"]]),
    null,
  );

  assert.equal(headers.get(AUTHENTICATED_USER_ID_HEADER), null);
});

test("buildAuthenticatedRequestHeaders replaces a spoofed identity with the middleware-verified user", () => {
  const headers = buildAuthenticatedRequestHeaders(
    new Headers([[AUTHENTICATED_USER_ID_HEADER, "attacker-controlled-user-id"]]),
    "verified-user-id",
  );

  assert.equal(headers.get(AUTHENTICATED_USER_ID_HEADER), "verified-user-id");
});

test("buildRateLimitedResponse preserves a rotated session cookie on 429", () => {
  const sessionResponse = NextResponse.next();
  sessionResponse.cookies.set("sb-project-auth-token", "rotated-session-token", {
    httpOnly: true,
    path: "/",
  });

  const response = buildRateLimitedResponse(
    { limit: 20, remaining: 0, reset: 12345 },
    sessionResponse,
  );

  assert.equal(response.status, 429);
  assert.equal(response.headers.get("X-RateLimit-Limit"), "20");
  assert.equal(response.cookies.get("sb-project-auth-token")?.value, "rotated-session-token");
});
