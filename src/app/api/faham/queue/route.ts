import { NextResponse } from "next/server";
import { getLocale } from "next-intl/server";
import { ZodError } from "zod";
import {
  buildFahamQueueSnapshot,
  fahamQueueRequestSchema,
} from "@/features/faham/server";
import { getOptionalAuthUser } from "@/features/auth/server";

export async function POST(request: Request): Promise<NextResponse> {
  let rawBody: unknown = {};
  try {
    rawBody = await request.json();
  } catch {
    rawBody = {};
  }

  try {
    const body = fahamQueueRequestSchema.parse(rawBody);
    const user = await getOptionalAuthUser();
    const userId = user?.id;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // The MEANING language follows the request locale (NEXT_LOCALE cookie),
    // resolved server-side via getLocale() — same pattern as the home
    // dashboard route. An explicit body.meaningLocale wins (used by the client
    // and by tests); otherwise the cookie locale decides ms vs en.
    const requestLocale = await getLocale();
    const meaningLocale = body.meaningLocale ?? (requestLocale === "en" ? "en" : "ms");

    const snapshot = await buildFahamQueueSnapshot(userId, {
      directionMode: body.directionMode,
      meaningLocale,
      dueLimit: body.dueLimit,
      minDistinctContextCount: body.minDistinctContextCount,
      minExposureEventCount: body.minExposureEventCount,
      minOccurrenceWeight: body.minOccurrenceWeight,
      newLimit: body.newLimit,
      pauseNewCardsAboveDueCount: body.pauseNewCardsAboveDueCount,
      preferredSources: body.preferredSources,
      isRevision: body.isRevision,
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
