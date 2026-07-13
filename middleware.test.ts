import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest, NextResponse } from "next/server";
import { createMiddleware } from "./middleware";

test("rate-limited API requests do not invoke Supabase session refresh", async () => {
  let refreshCalls = 0;
  const middleware = createMiddleware({
    checkRateLimit: async () => ({ success: false, limit: 20, remaining: 0, reset: 12345 }),
    updateSupabaseSession: async () => {
      refreshCalls += 1;
      return NextResponse.next();
    },
  });

  const response = await middleware(new NextRequest("https://miftah.test/api/feedback"));

  assert.equal(response.status, 429);
  assert.equal(refreshCalls, 0);
});
