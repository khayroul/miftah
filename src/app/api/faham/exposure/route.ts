import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { recordVocabExposureEvents } from "@/lib/faham/repository";
import { fahamExposureSchema } from "@/lib/faham/schemas";
import { getOptionalAuthUser } from "@/lib/auth-server";

export async function POST(request: Request): Promise<NextResponse> {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const body = fahamExposureSchema.parse(rawBody);
    const user = await getOptionalAuthUser();
    const userId = user?.id;
    if (!userId) {
      // Silently skip for unauthenticated users — exposure logging is non-critical
      return NextResponse.json({ ok: false, reason: "unauthenticated" });
    }

    const result = await recordVocabExposureEvents(userId, body);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid parameters", issues: error.issues },
        { status: 400 },
      );
    }

    console.error("[faham/exposure] Error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
