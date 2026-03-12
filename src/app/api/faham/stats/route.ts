import { NextResponse } from "next/server";
import { getFahamStats } from "@/lib/faham/repository";
import { getOptionalAuthUser } from "@/lib/auth-server";

export async function GET(): Promise<NextResponse> {
  try {
    const user = await getOptionalAuthUser();
    const userId = user?.id;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const stats = await getFahamStats(userId);
    return NextResponse.json(stats);
  } catch (error) {
    console.error("[faham/stats] Error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
