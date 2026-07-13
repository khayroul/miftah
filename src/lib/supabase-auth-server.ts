import {
  createServerClient,
  type CookieOptions,
} from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import {
  buildAuthenticatedRequestHeaders,
} from "./auth-request-context";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

type SessionCookie = {
  name: string;
  options: CookieOptions;
  value: string;
};

/**
 * Preserve every batch emitted by Supabase. A refresh can emit more than one
 * batch, and replacing this collection would drop cookies from an earlier one.
 */
export function appendSessionCookies(
  existingCookies: readonly SessionCookie[],
  newCookies: readonly SessionCookie[],
): SessionCookie[] {
  return [...existingCookies, ...newCookies];
}

export async function createSupabaseServerClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, options, value } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot always write cookies directly.
          // Middleware handles session refresh persistence.
        }
      },
    },
  });
}

export async function updateSupabaseSession(
  request: NextRequest,
): Promise<NextResponse> {
  let cookiesToSet: SessionCookie[] = [];

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(newCookies) {
        for (const { name, value } of newCookies) {
          request.cookies.set(name, value);
        }

        cookiesToSet = appendSessionCookies(
          cookiesToSet,
          newCookies.map(({ name, options, value }) => ({ name, options, value })),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const response = NextResponse.next({
    request: {
      // Supabase's setAll mutates request.cookies (and therefore the Cookie
      // header). Build this only after getUser so downstream handlers receive
      // the rotated token, not the pre-refresh request headers.
      headers: buildAuthenticatedRequestHeaders(request.headers, user?.id ?? null),
    },
  });

  for (const { name, options, value } of cookiesToSet) {
    response.cookies.set(name, value, options);
  }

  return response;
}
