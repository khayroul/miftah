import type { User } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "./supabase-auth-server";
import { buildSignInPath } from "./auth";
import { AUTHENTICATED_USER_ID_HEADER } from "./auth-request-context";

export type AuthenticatedUser = Pick<User, "id">;

/**
 * Server-only auth helpers.
 * These MUST NOT be imported into client components.
 */

export async function getOptionalAuthUser(): Promise<AuthenticatedUser | null> {
  const requestHeaders = await headers();
  const verifiedUserId = requestHeaders.get(AUTHENTICATED_USER_ID_HEADER);
  if (verifiedUserId) {
    return { id: verifiedUserId };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user ? { id: user.id } : null;
}

export async function requireAuthUser(nextPath: string): Promise<AuthenticatedUser> {
  const user = await getOptionalAuthUser();
  if (!user) {
    redirect(buildSignInPath(nextPath));
  }

  return user;
}
