import { NextResponse, after } from "next/server";
import { revalidateTag } from "next/cache";
import { recomputeAndStoreSnapshot } from "@/lib/homeDashboardDb";
import { getOptionalAuthUser } from "@/lib/auth-server";
import {
  getUserDailyGoal,
  recommendHifzPageGoalFromAyahGoal,
} from "@/lib/activity";
import { supabaseServer } from "@/lib/supabase-server";

export async function POST(): Promise<NextResponse> {
  try {
    const user = await getOptionalAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const currentGoal = await getUserDailyGoal(user.id);
    if (currentGoal.type !== "hifz_ayat") {
      return NextResponse.json(
        { error: "Only legacy hifz ayah goals can be migrated." },
        { status: 400 },
      );
    }

    const nextCount = recommendHifzPageGoalFromAyahGoal(currentGoal.count);
    const { error } = await supabaseServer
      .from("profiles")
      .update({
        daily_goal_count: nextCount,
        daily_goal_type: "hifz_pages",
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (error) {
      throw error;
    }

    revalidateTag("hifz", "max");
    revalidateTag("home-dashboard", "max");
    after(() => recomputeAndStoreSnapshot(user.id));
    return NextResponse.json({
      ok: true,
      previousCount: currentGoal.count,
      previousType: currentGoal.type,
      nextCount,
      nextType: "hifz_pages",
    });
  } catch (error) {
    console.error("[profile/daily-goal/hifz-pages] Error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
