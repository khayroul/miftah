import { NextResponse } from "next/server";
import { getOptionalAuthUser } from "@/features/auth/server";
import { buildDailyPlanWithDetails } from "@/data/repositories/hifz";
import { buildHifzQueueResponse } from "@/features/hifz/domain/queue";

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");

  if (type !== "memorize" && type !== "review") {
    return NextResponse.json({ error: "Invalid type param" }, { status: 400 });
  }

  try {
    const user = await getOptionalAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const plan = await buildDailyPlanWithDetails(user.id);
    return NextResponse.json(buildHifzQueueResponse(type, plan));
  } catch (err) {
    console.error("[hifz/queue] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
