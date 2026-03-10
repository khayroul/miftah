import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { buildFahamQueueSnapshot } from "@/lib/faham/queue";
import { fahamQueueRequestSchema } from "@/lib/faham/schemas";

export async function POST(request: Request): Promise<NextResponse> {
  let rawBody: unknown = {};
  try {
    rawBody = await request.json();
  } catch {
    rawBody = {};
  }

  try {
    const body = fahamQueueRequestSchema.parse(rawBody);
    const userId = process.env.MIFTAH_USER_ID?.trim();
    if (!userId) {
      return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
    }

    const snapshot = await buildFahamQueueSnapshot(userId, {
      directionMode: body.directionMode,
      dueLimit: body.dueLimit,
      minDistinctContextCount: body.minDistinctContextCount,
      minExposureEventCount: body.minExposureEventCount,
      minOccurrenceWeight: body.minOccurrenceWeight,
      newLimit: body.newLimit,
      pauseNewCardsAboveDueCount: body.pauseNewCardsAboveDueCount,
      preferredSources: body.preferredSources,
    });

    return NextResponse.json(snapshot);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid parameters", issues: error.issues },
        { status: 400 },
      );
    }

    console.error("[faham/queue] Error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
