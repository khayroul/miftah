import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-auth-server";

// This route accepts unauthenticated feedback, so cap the attacker-controlled
// `metadata` blob to keep it from being used to bloat the table.
const MAX_METADATA_BYTES = 8 * 1024; // 8KB serialized

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { body, metadata } = await request.json();

    if (!body) {
      return NextResponse.json({ error: "Body is required" }, { status: 400 });
    }

    if (metadata !== undefined && metadata !== null) {
      let serializedMetadata: string;
      try {
        serializedMetadata = JSON.stringify(metadata);
      } catch {
        return NextResponse.json(
          { error: "Invalid metadata" },
          { status: 400 },
        );
      }
      if (serializedMetadata.length > MAX_METADATA_BYTES) {
        return NextResponse.json(
          { error: "Metadata too large" },
          { status: 413 },
        );
      }
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
