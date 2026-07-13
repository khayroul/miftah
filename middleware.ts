import type { NextRequest } from "next/server";
import { updateSupabaseSession } from "@/lib/supabase-auth-server";
import {
  buildRateLimitedResponse,
  checkRateLimit,
  type RateLimitDetails,
} from "@/lib/ratelimit";

type MiddlewareDependencies = {
  checkRateLimit: (key: string) => Promise<RateLimitDetails>;
  updateSupabaseSession: (request: NextRequest) => ReturnType<typeof updateSupabaseSession>;
};

const defaultDependencies: MiddlewareDependencies = {
  checkRateLimit,
  updateSupabaseSession,
};

export function createMiddleware(dependencies: MiddlewareDependencies = defaultDependencies) {
  return async function middleware(request: NextRequest) {
    if (request.nextUrl.pathname.startsWith("/api")) {
      const ip = request.headers.get("x-forwarded-for") ?? "anonymous";
      const { success, limit, remaining, reset } = await dependencies.checkRateLimit(
        `ratelimit_api_${ip}`,
      );

      if (!success) {
        // Deliberately gate refresh behind the limiter. This means a stale token
        // is not rotated on 429 responses, but prevents abusive API traffic from
        // consuming Supabase auth capacity before the limiter rejects it.
        return buildRateLimitedResponse({ success, limit, remaining, reset });
      }
    }

    return dependencies.updateSupabaseSession(request);
  };
}

export const middleware = createMiddleware();

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ttf|woff2?)$).*)",
  ],
};
