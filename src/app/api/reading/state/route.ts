import { NextResponse, after } from "next/server";
import { revalidateTag } from "next/cache";
import { recomputeAndStoreSnapshot } from "@/lib/homeDashboardDb";
import { ZodError, z } from "zod";
import { getOptionalAuthUser } from "@/lib/auth-server";
import { saveUserReadingState } from "@/lib/userReadingState";
import { recordActivityEvent } from "@/lib/activityEvents";

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
    // Two independent writes to different tables (reading state vs.
    // activity_events) — run concurrently instead of serially.
    const [state] = await Promise.all([
      saveUserReadingState(user.id, body.page),
      recordActivityEvent({
        activityType: "read_page_viewed",
        entityId: body.page,
        entityKey: String(body.page),
        entityType: "page",
        metadata: {
          page: body.page,
        },
        userId: user.id,
      }),
    ]);
    revalidateTag("home-dashboard", "max");
    after(() => recomputeAndStoreSnapshot(user.id));
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
