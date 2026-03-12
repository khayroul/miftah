import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-auth-server";

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { body, metadata } = await request.json();

    if (!body) {
      return NextResponse.json({ error: "Body is required" }, { status: 400 });
    }

    // Get current user if any
    const { data: { user } } = await supabase.auth.getUser();

    const { error } = await supabase.from("feedback").insert({
      user_id: user?.id ?? null,
      body,
      metadata: {
        ...metadata,
        url: request.headers.get("referer"),
        userAgent: request.headers.get("user-agent"),
      },
    });

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("Feedback error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
