import { NextResponse } from "next/server";

export const AUTHENTICATED_USER_ID_HEADER = "x-miftah-authenticated-user-id";

type RateLimitDetails = {
  limit: number;
  remaining: number;
  reset: number;
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

/**
 * A rate-limited request may have refreshed its session in middleware. Copy
 * those cookies so the browser never loses a valid token rotation on a 429.
 */
export function buildRateLimitedResponse(
  { limit, remaining, reset }: RateLimitDetails,
  sessionResponse: NextResponse,
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

  for (const cookie of sessionResponse.cookies.getAll()) {
    response.cookies.set(cookie);
  }

  return response;
}
