import { NextResponse } from "next/server";
import { getFahamStats } from "@/data/repositories/faham";
import { getFahamLevelState } from "@/data/repositories/faham-levels";
import { buildFahamLevelProgress } from "@/features/faham/server";
import { getOptionalAuthUser } from "@/features/auth/server";

export async function GET(): Promise<NextResponse> {
  try {
    const user = await getOptionalAuthUser();
    const userId = user?.id;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const levelState = await getFahamLevelState(userId);
    const stats = await getFahamStats(userId, levelState.activeWordLimit);

    return NextResponse.json({
      ...stats,
      levelProgress: buildFahamLevelProgress(levelState),
    });
  } catch (error) {
    console.error("[faham/stats] Error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
