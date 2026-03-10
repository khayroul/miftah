import { NextResponse } from "next/server";
import { ZodError, z } from "zod";
import { getOptionalAuthUser } from "@/lib/auth";
import { saveUserReadingState } from "@/lib/userReadingState";

const readingStateSchema = z.object({
  page: z.number().int().min(1).max(604),
});

export async function POST(request: Request): Promise<NextResponse> {
  const user = await getOptionalAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const body = readingStateSchema.parse(rawBody);
    const state = await saveUserReadingState(user.id, body.page);
    return NextResponse.json({ ok: true, state });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid parameters", issues: error.issues },
        { status: 400 },
      );
    }

    console.error("[reading/state] Error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
