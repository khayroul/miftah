import type { User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "./supabase-auth-server";
import { buildSignInPath } from "./auth";

export type AuthenticatedUser = Pick<User, "id">;

/**
 * Server-only auth helpers.
 * These MUST NOT be imported into client components.
 */

export function authenticatedUserFromClaims(
  claims: { sub?: unknown } | null,
): AuthenticatedUser | null {
  if (typeof claims?.sub !== "string" || claims.sub.length === 0) {
    return null;
  }

  return { id: claims.sub };
}

export async function getOptionalAuthUser(): Promise<AuthenticatedUser | null> {
  const supabase = await createSupabaseServerClient();

  try {
    const { data, error } = await supabase.auth.getClaims();
    if (error) {
      console.error("Unable to validate authenticated user claims");
      return null;
    }

    return authenticatedUserFromClaims(data?.claims ?? null);
  } catch {
    console.error("Unable to validate authenticated user claims");
    return null;
  }
}

export async function requireAuthUser(nextPath: string): Promise<AuthenticatedUser> {
  const user = await getOptionalAuthUser();
  if (!user) {
    redirect(buildSignInPath(nextPath));
  }

  return user;
}
