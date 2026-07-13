import { NextResponse, after } from "next/server";
import { revalidateTag } from "next/cache";
import { recomputeAndStoreSnapshot } from "@/features/home/server";
import { supabaseServer } from "@/lib/supabase-server";
import { getOptionalAuthUser } from "@/lib/auth-server";
import { matureCardDbRow } from "@/lib/hifz/fsrs-bridge";
import { buildDailyPlanWithDetails } from "@/lib/hifz/scheduler";
import { buildHifzPlanSnapshot } from "@/lib/hifz/queue";
import { getHifzStats, getJuzProgress } from "@/lib/hifz/stats";
import { getAyatUpToPage } from "@/lib/queries";

interface ImportBody {
  upToPage?: number;
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: ImportBody;
  try {
    body = (await request.json()) as ImportBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const upToPage = body.upToPage;
  if (
    typeof upToPage !== "number" ||
    !Number.isInteger(upToPage) ||
    upToPage < 1 ||
    upToPage > 604
  ) {
    return NextResponse.json(
      { error: "upToPage must be an integer between 1 and 604" },
      { status: 400 },
    );
  }

  try {
    const user = await getOptionalAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = user.id;
    const ayat = await getAyatUpToPage(upToPage);
    if (ayat.length === 0) {
      return NextResponse.json({ ok: true, count: 0 });
    }

    const ayahIds = ayat.map((a) => a.id);

    // Find existing progress rows to skip manzil items
    const { data: existing } = await supabaseServer
      .from("study_progress")
      .select("ayah_id, hifz_status")
      .eq("user_id", userId)
      .in("ayah_id", ayahIds);

    const alreadyManzil = new Set(
      (existing ?? [])
        .filter((r) => r.hifz_status === "manzil")
        .map((r) => r.ayah_id),
    );
    const existingMap = new Map(
      (existing ?? []).map((r) => [r.ayah_id, r.hifz_status]),
    );

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const fsrs = matureCardDbRow();

    // Split into inserts (new) and updates (existing but not manzil)
    const toInsert: Array<Record<string, unknown>> = [];
    const toUpdate: number[] = [];

    for (const ayahId of ayahIds) {
      if (alreadyManzil.has(ayahId)) continue;

      if (existingMap.has(ayahId)) {
        toUpdate.push(ayahId);
      } else {
        toInsert.push({
          user_id: userId,
          ayah_id: ayahId,
          hifz_status: "manzil",
          sabak_started_at: thirtyDaysAgo.toISOString(),
          moved_to_sabqi_at: thirtyDaysAgo.toISOString(),
          moved_to_manzil_at: now.toISOString(),
          ...fsrs,
        });
      }
    }

    // Batch insert new rows (chunks of 500 for Supabase limits)
    for (let i = 0; i < toInsert.length; i += 500) {
      const chunk = toInsert.slice(i, i + 500);
      const { error } = await supabaseServer
        .from("study_progress")
        .insert(chunk);
      if (error) throw error;
    }

    // Batch update existing non-manzil rows
    if (toUpdate.length > 0) {
      for (let i = 0; i < toUpdate.length; i += 500) {
        const chunk = toUpdate.slice(i, i + 500);
        const { error } = await supabaseServer
          .from("study_progress")
          .update({
            hifz_status: "manzil",
            moved_to_sabqi_at: thirtyDaysAgo.toISOString(),
            moved_to_manzil_at: now.toISOString(),
            ...fsrs,
            updated_at: now.toISOString(),
          })
          .eq("user_id", userId)
          .in("ayah_id", chunk);
        if (error) throw error;
      }
    }

    const [plan, stats, juzProgress] = await Promise.all([
      buildDailyPlanWithDetails(userId),
      getHifzStats(userId),
      getJuzProgress(userId),
    ]);
    const snapshot = buildHifzPlanSnapshot(plan);
    const count = toInsert.length + toUpdate.length;

    revalidateTag("hifz", "max");
    revalidateTag("home-dashboard", "max");
    after(() => recomputeAndStoreSnapshot(userId));
    return NextResponse.json({
      ok: true,
      count,
      newPages: snapshot.newPages,
      nextPage: snapshot.nextPage,
      queue: snapshot.memorizeQueue.pageOrder.length > 0
        ? snapshot.memorizeQueue
        : null,
      reviewPages: snapshot.reviewPages,
      stats,
      upToPage,
      juzProgress,
    });
  } catch (error) {
    console.error("[hifz/import-memorized] Error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
