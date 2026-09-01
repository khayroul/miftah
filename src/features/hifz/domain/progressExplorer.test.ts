import { describe, expect, it } from "vitest";
import type { PageGridEntry } from "./types";
import {
  matchesHifzProgressFilter,
  summarizeHifzPageGrid,
} from "./progressExplorer";

const GRID: PageGridEntry[] = [
  { page: 1, juz: 1, status: "manzil", lastReviewedAt: null },
  { page: 2, juz: 1, status: "sabak", lastReviewedAt: null },
  { page: 3, juz: 1, status: "sabqi", lastReviewedAt: null },
  { page: 4, juz: 1, status: "due", lastReviewedAt: null },
  { page: 5, juz: 1, status: "overdue", lastReviewedAt: null },
  { page: 6, juz: 1, status: "not-started", lastReviewedAt: null },
];

describe("summarizeHifzPageGrid", () => {
  it("groups page states into useful progress totals", () => {
    expect(summarizeHifzPageGrid(GRID)).toEqual({
      duePages: 2,
      learningPages: 2,
      notStartedPages: 1,
      strongPages: 1,
    });
  });
});

describe("matchesHifzProgressFilter", () => {
  it("groups sabak and sabqi under learning", () => {
    expect(GRID.filter((entry) => matchesHifzProgressFilter(entry, "learning"))).toHaveLength(2);
  });

  it("groups due and overdue under due", () => {
    expect(GRID.filter((entry) => matchesHifzProgressFilter(entry, "due"))).toHaveLength(2);
  });
});
