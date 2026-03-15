import { NextResponse } from "next/server";
import { sanitizeNextPath } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase-auth-server";

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const type = url.searchParams.get("type");
  const nextPath = sanitizeNextPath(url.searchParams.get("next"), "/");

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Recovery flow: redirect to reset password page instead of nextPath
      if (type === "recovery") {
        return NextResponse.redirect(new URL("/auth/reset-password", url.origin));
      }
      return NextResponse.redirect(new URL(nextPath, url.origin));
    }
  }

  // On error during recovery, send to reset-password with error flag
  if (type === "recovery") {
    return NextResponse.redirect(
      new URL("/auth/reset-password?error=callback", url.origin),
    );
  }

  return NextResponse.redirect(
    new URL(`/auth/sign-in?error=callback&next=${encodeURIComponent(nextPath)}`, url.origin),
  );
}
