import type { NextRequest } from "next/server";
import { updateSupabaseSession } from "@/lib/supabase-auth-server";
import { checkRateLimit } from "@/lib/ratelimit";
import { buildRateLimitedResponse } from "@/lib/auth-request-context";

export async function middleware(request: NextRequest) {
  const sessionResponsePromise = updateSupabaseSession(request);

  // Rate limiting and session validation are independent. Always complete
  // session refresh first so a 429 cannot discard a rotated refresh token.
  if (request.nextUrl.pathname.startsWith("/api")) {
    const ip = request.headers.get("x-forwarded-for") ?? "anonymous";
    const [sessionResponse, { success, limit, remaining, reset }] = await Promise.all([
      sessionResponsePromise,
      checkRateLimit(`ratelimit_api_${ip}`),
    ]);

    if (!success) {
      return buildRateLimitedResponse(
        { limit, remaining, reset },
        sessionResponse,
      );
    }

    return sessionResponse;
  }

  return sessionResponsePromise;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ttf|woff2?)$).*)",
  ],
};
