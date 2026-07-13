import { NextResponse } from "next/server";

export const AUTHENTICATED_USER_ID_HEADER = "x-miftah-authenticated-user-id";

export type RateLimitDetails = {
  limit: number;
  remaining: number;
  reset: number;
  success: boolean;
};

/**
 * Produces the request headers visible to downstream handlers. The incoming
 * identity header is always removed first so only middleware can set it after
 * Supabase has validated the current session.
 */
export function buildAuthenticatedRequestHeaders(
  incomingHeaders: Headers,
  verifiedUserId: string | null,
): Headers {
  const headers = new Headers(incomingHeaders);
  headers.delete(AUTHENTICATED_USER_ID_HEADER);

  if (verifiedUserId) {
    headers.set(AUTHENTICATED_USER_ID_HEADER, verifiedUserId);
  }

  return headers;
}

export function buildRateLimitedResponse(
  { limit, remaining, reset }: RateLimitDetails,
): NextResponse {
  const response = new NextResponse(
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

  return response;
}
