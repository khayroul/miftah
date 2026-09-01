import type { PageGridEntry, PageGridStatus } from "./types";

export type HifzProgressFilter =
  | "all"
  | "learning"
  | "due"
  | "strong"
  | "not-started";

export interface HifzProgressSummary {
  duePages: number;
  learningPages: number;
  notStartedPages: number;
  strongPages: number;
}

const FILTER_STATUSES: Record<Exclude<HifzProgressFilter, "all">, PageGridStatus[]> = {
  learning: ["sabak", "sabqi"],
  due: ["due", "overdue"],
  strong: ["manzil"],
  "not-started": ["not-started"],
};

export function matchesHifzProgressFilter(
  entry: PageGridEntry,
  filter: HifzProgressFilter,
): boolean {
  if (filter === "all") {
    return true;
  }

  return FILTER_STATUSES[filter].includes(entry.status);
}

export function summarizeHifzPageGrid(
  pageGrid: PageGridEntry[],
): HifzProgressSummary {
  return pageGrid.reduce<HifzProgressSummary>(
    (summary, entry) => ({
      duePages:
        summary.duePages +
        (entry.status === "due" || entry.status === "overdue" ? 1 : 0),
      learningPages:
        summary.learningPages +
        (entry.status === "sabak" || entry.status === "sabqi" ? 1 : 0),
      notStartedPages:
        summary.notStartedPages + (entry.status === "not-started" ? 1 : 0),
      strongPages:
        summary.strongPages + (entry.status === "manzil" ? 1 : 0),
    }),
    {
      duePages: 0,
      learningPages: 0,
      notStartedPages: 0,
      strongPages: 0,
    },
  );
}
