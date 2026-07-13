import type { HifzBlock, HifzFlowType, HifzQueueItem } from "./sessionQueue";
import type { DailyPlanWithDetails, PlanItem } from "@/data/repositories/hifz";

export interface HifzQueueResponse {
  items: HifzQueueItem[];
  pageOrder: number[];
}

export interface HifzPlanSnapshot {
  memorizeQueue: HifzQueueResponse;
  reviewQueue: HifzQueueResponse;
  newPages: number;
  reviewPages: number;
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

export function countUniqueQueuePages(items: HifzQueueItem[]): number {
  return uniquePages(items).length;
}

export function countUniquePlanItemPages(items: PlanItem[]): number {
  return new Set(items.map((item) => item.ayah.pageNumber)).size;
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
    newPages: memorizeQueue.pageOrder.length,
    reviewPages: reviewQueue.pageOrder.length,
    nextPage: memorizeQueue.pageOrder[0] ?? null,
  };
}
