import type { HifzBlock, HifzFlowType, HifzQueueItem } from "@/lib/hifz/sessionQueue";
import type { DailyPlanWithDetails, PlanItem } from "@/lib/hifz/scheduler";

export interface HifzQueueResponse {
  items: HifzQueueItem[];
  pageOrder: number[];
}

export interface HifzPlanSnapshot {
  memorizeQueue: HifzQueueResponse;
  reviewQueue: HifzQueueResponse;
  newCount: number;
  reviewCount: number;
  nextPage: number | null;
}

function planItemsToQueue(items: PlanItem[], block: HifzBlock): HifzQueueItem[] {
  return items.map((item) => ({
    progressId: item.progress.id,
    ayahId: item.ayah.id,
    ayahKey: `${item.ayah.surahId}:${item.ayah.ayahNumber}`,
    pageNumber: item.ayah.pageNumber,
    block,
  }));
}

function uniquePages(items: HifzQueueItem[]): number[] {
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

function buildQueueResponse(items: HifzQueueItem[]): HifzQueueResponse {
  return {
    items,
    pageOrder: uniquePages(items),
  };
}

export function buildHifzQueueResponse(
  type: HifzFlowType,
  plan: DailyPlanWithDetails,
): HifzQueueResponse {
  if (type === "memorize") {
    return buildQueueResponse(planItemsToQueue(plan.sabak, "sabak"));
  }

  return buildQueueResponse([
    ...planItemsToQueue(plan.sabqi, "sabqi"),
    ...planItemsToQueue(plan.manzil, "manzil"),
  ]);
}

export function buildHifzPlanSnapshot(
  plan: DailyPlanWithDetails,
): HifzPlanSnapshot {
  const memorizeQueue = buildHifzQueueResponse("memorize", plan);
  const reviewQueue = buildHifzQueueResponse("review", plan);

  return {
    memorizeQueue,
    reviewQueue,
    newCount: plan.sabak.length,
    reviewCount: plan.sabqi.length + plan.manzil.length,
    nextPage: memorizeQueue.pageOrder[0] ?? null,
  };
}
