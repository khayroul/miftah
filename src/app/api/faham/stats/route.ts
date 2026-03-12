import { NextResponse } from "next/server";
import { getFahamStats } from "@/lib/faham/repository";
import { buildFahamLevelProgress, getFahamLevelState } from "@/lib/faham/levels";
import { getOptionalAuthUser } from "@/lib/auth-server";

export async function GET(): Promise<NextResponse> {
  try {
    const user = await getOptionalAuthUser();
    const userId = user?.id;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [stats, levelState] = await Promise.all([
      getFahamStats(userId),
      getFahamLevelState(userId),
    ]);

    return NextResponse.json({
      ...stats,
      levelProgress: buildFahamLevelProgress(levelState),
    });
  } catch (error) {
    console.error("[faham/stats] Error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
