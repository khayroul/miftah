import { NextResponse } from "next/server";
import { getOptionalAuthUser } from "@/lib/auth-server";
import { buildDailyPlanWithDetails } from "@/lib/hifz/scheduler";
import type { PlanItem } from "@/lib/hifz/scheduler";

interface QueueItem {
  progressId: number;
  ayahId: number;
  ayahKey: string;
  pageNumber: number;
  block: "sabak" | "sabqi" | "manzil";
}

function planItemsToQueue(
  items: PlanItem[],
  block: "sabak" | "sabqi" | "manzil",
): QueueItem[] {
  return items.map((item) => ({
    progressId: item.progress.id,
    ayahId: item.ayah.id,
    ayahKey: `${item.ayah.surahId}:${item.ayah.ayahNumber}`,
    pageNumber: item.ayah.pageNumber,
    block,
  }));
}

function uniquePages(items: QueueItem[]): number[] {
  const seen = new Set<number>();
  const pages: number[] = [];
  for (const item of items) {
    if (!seen.has(item.pageNumber)) {
      seen.add(item.pageNumber);
      pages.push(item.pageNumber);
    }
  }
  return pages;
}

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

    let items: QueueItem[];
    if (type === "memorize") {
      items = planItemsToQueue(plan.sabak, "sabak");
    } else {
      items = [
        ...planItemsToQueue(plan.sabqi, "sabqi"),
        ...planItemsToQueue(plan.manzil, "manzil"),
      ];
    }

    return NextResponse.json({
      items,
      pageOrder: uniquePages(items),
    });
  } catch (err) {
    console.error("[hifz/queue] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
