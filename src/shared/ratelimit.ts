import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { NextResponse } from "next/server";

export type RateLimitDetails = {
  limit: number;
  remaining: number;
  reset: number;
  success: boolean;
};

// Only enable if Upstash credentials are provided
const hasUpstash = !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);

export const ratelimit = hasUpstash
  ? new Ratelimit({
      redis: Redis.fromEnv(),
      limiter: Ratelimit.slidingWindow(20, "10 s"), // 20 requests per 10 seconds per IP
      analytics: true,
      prefix: "@upstash/ratelimit",
    })
  : null;

/**
 * Check rate limit for a given identifier (e.g. user IP)
 * Returns { success, limit, remaining, reset }
 */
export async function checkRateLimit(identifier: string) {
  if (!ratelimit) {
    return { success: true, limit: 0, remaining: 0, reset: 0 };
  }
  return await ratelimit.limit(identifier);
}

export function buildRateLimitedResponse(
  { limit, remaining, reset }: RateLimitDetails,
): NextResponse {
  return new NextResponse(
    "Panggilan API terlalu kerap. Sila tunggu sebentar.",
    {
      status: 429,
      headers: {
        "X-RateLimit-Limit": limit.toString(),
        "X-RateLimit-Remaining": remaining.toString(),
        "X-RateLimit-Reset": reset.toString(),
      },
    },
  );
}
