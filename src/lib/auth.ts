import type { User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "./supabase-auth-server";

export function sanitizeNextPath(
  value: string | null | undefined,
  fallback = "/",
): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return fallback;
  }

  return value;
}

export function buildSignInPath(nextPath: string): string {
  return `/auth/sign-in?next=${encodeURIComponent(nextPath)}`;
}

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
