import { NextResponse } from "next/server";
import { ZodError, z } from "zod";
import { getOptionalAuthUser } from "@/lib/auth";
import { markThemeChunkProgress } from "@/lib/themeChunkProgress";

const themeProgressSchema = z.object({
  chunkIndex: z.number().int().min(1),
  status: z.enum(["started", "completed"]).default("started"),
  surahId: z.number().int().min(1).max(114),
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
    const body = themeProgressSchema.parse(rawBody);
    const progress = await markThemeChunkProgress({
      chunkIndex: body.chunkIndex,
      status: body.status,
      surahId: body.surahId,
      userId: user.id,
    });

    return NextResponse.json({ ok: true, progress });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid parameters", issues: error.issues },
        { status: 400 },
      );
    }

    console.error("[theme/progress] Error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
