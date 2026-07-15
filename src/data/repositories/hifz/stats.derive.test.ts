import { describe, it, expect } from "vitest";
import {
  deriveHifzStats,
  deriveJuzProgress,
  derivePageGrid,
  getHifzOverview,
} from "./stats";

// Synthetic v_hifz_page_progress rows: two pages in juz 1, one page in juz 2.
const ROWS = [
  {
    page_number: 1,
    juz_number: 1,
    is_started: true,
    is_complete_manzil: true,
    is_due: false,
    sabak_ayat: 0,
    sabqi_ayat: 0,
  },
  {
    page_number: 2,
    juz_number: 1,
    is_started: true,
    is_complete_manzil: false,
    is_due: true,
    sabak_ayat: 3,
    sabqi_ayat: 2,
  },
  {
    page_number: 22,
    juz_number: 2,
    is_started: true,
    is_complete_manzil: false,
    is_due: false,
    sabak_ayat: 0,
    sabqi_ayat: 5,
  },
];

describe("deriveJuzProgress", () => {
  it("aggregates page rows into 30 juz stats", () => {
    const juz = deriveJuzProgress(ROWS);
    expect(juz).toHaveLength(30);
    expect(juz[0]).toMatchObject({
      juz: 1,
      manzilPages: 1,
      sabqiPages: 1,
      sabakPages: 1,
    });
    expect(juz[1]).toMatchObject({ juz: 2, manzilPages: 0, sabqiPages: 1 });
    // Untouched juz derive to zero progress
    expect(juz[29]).toMatchObject({ juz: 30, manzilPages: 0, sabakPages: 0 });
  });
});

describe("deriveHifzStats", () => {
  it("counts manzil/due pages and computes the review streak", () => {
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const stats = deriveHifzStats(ROWS, [today, yesterday]);
    expect(stats.totalManzilPages).toBe(1);
    expect(stats.dueTodayPages).toBe(1);
    expect(stats.streak).toBe(2);
  });

  it("streak is 0 when the last review is older than yesterday", () => {
    const stats = deriveHifzStats(ROWS, ["2001-01-01"]);
    expect(stats.streak).toBe(0);
  });
});

describe("derivePageGrid", () => {
  it("maps every page with status precedence due > manzil > sabqi > sabak", () => {
    const grid = derivePageGrid(
      ROWS,
      new Map([[1, "2026-07-14T00:00:00Z"]]),
    );
    expect(grid).toHaveLength(604);
    expect(grid[0]).toMatchObject({
      page: 1,
      status: "manzil",
      lastReviewedAt: "2026-07-14T00:00:00Z",
    });
    // Page 2 is due AND has sabak/sabqi ayat — due wins.
    expect(grid[1]).toMatchObject({ page: 2, status: "due" });
    expect(grid[21]).toMatchObject({ page: 22, status: "sabqi" });
    // Pages without rows are not-started with juz derived from page number.
    expect(grid[603]).toMatchObject({ page: 604, status: "not-started" });
  });
});

describe("getHifzOverview", () => {
  it("is exported and callable (query plumbing is exercised in integration)", () => {
    expect(typeof getHifzOverview).toBe("function");
  });
});
