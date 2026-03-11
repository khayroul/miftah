import type { User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "./supabase-auth-server";
import { buildSignInPath } from "./auth";

/**
 * Server-only auth helpers.
 * These MUST NOT be imported into client components.
 */

export async function getOptionalAuthUser(): Promise<User | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user ?? null;
}

export async function requireAuthUser(nextPath: string): Promise<User> {
  const user = await getOptionalAuthUser();
  if (!user) {
    redirect(buildSignInPath(nextPath));
  }

  return user;
}
