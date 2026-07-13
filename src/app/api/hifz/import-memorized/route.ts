import { NextResponse, after } from "next/server";
import { revalidateTag } from "next/cache";
import { recomputeAndStoreSnapshot } from "@/features/home/server";
import { getOptionalAuthUser } from "@/lib/auth-server";
import {
  buildDailyPlanWithDetails,
  getHifzStats,
  getJuzProgress,
  importMemorizedProgress,
} from "@/data/repositories/hifz";
import { buildHifzPlanSnapshot } from "@/features/hifz/domain/queue";
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

    const count = await importMemorizedProgress({ ayahIds, userId });

    const [plan, stats, juzProgress] = await Promise.all([
      buildDailyPlanWithDetails(userId),
      getHifzStats(userId),
      getJuzProgress(userId),
    ]);
    const snapshot = buildHifzPlanSnapshot(plan);
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
