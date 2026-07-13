import { NextResponse, after } from "next/server";
import { revalidateTag } from "next/cache";
import { recomputeAndStoreSnapshot } from "@/features/home/server";
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

    // Consume the client's idempotency token (B6). The client stamps every
    // exposure POST with a stable per-event id and retries lost-response POSTs
    // with the SAME id. It is now persisted via the (user_id, event_id) partial
    // unique index inside recordVocabExposureEvents, making a retry a true
    // no-op; the id is also echoed back for request correlation.
    const eventId = request.headers.get("X-Miftah-Exposure-Event-Id");

    const result = await recordVocabExposureEvents(userId, body, eventId);
    revalidateTag("home-dashboard", "max");
    after(() => recomputeAndStoreSnapshot(userId));
    return NextResponse.json({ eventId, ok: true, ...result });
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
