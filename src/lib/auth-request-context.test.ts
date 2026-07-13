import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest, NextResponse } from "next/server";
import {
  AUTHENTICATED_USER_ID_HEADER,
  buildAuthenticatedRequestHeaders,
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

test("forwards the refreshed request cookie to downstream handlers", () => {
  const request = new NextRequest("https://miftah.test/api/feedback", {
    headers: {
      cookie: "sb-project-auth-token=expired-token; theme=night",
      [AUTHENTICATED_USER_ID_HEADER]: "attacker-controlled-user-id",
    },
  });

  // This mirrors Supabase's setAll behavior in updateSupabaseSession.
  request.cookies.set("sb-project-auth-token", "rotated-token");
  const response = NextResponse.next({
    request: {
      headers: buildAuthenticatedRequestHeaders(request.headers, "verified-user-id"),
    },
  });

  assert.equal(
    response.headers.get("x-middleware-request-cookie"),
    "sb-project-auth-token=rotated-token; theme=night",
  );
  assert.equal(
    response.headers.get(`x-middleware-request-${AUTHENTICATED_USER_ID_HEADER}`),
    "verified-user-id",
  );
});
