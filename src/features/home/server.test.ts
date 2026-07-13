import { beforeEach, describe, expect, it, vi } from "vitest";

const repositoryMocks = vi.hoisted(() => ({
  getHomeStoredDashboardSnapshot: vi.fn(),
  storeHomeDashboardSnapshot: vi.fn(),
}));

vi.mock("@/data/repositories/home", () => repositoryMocks);
vi.mock("next/cache", () => ({
  unstable_cache: (fn: unknown) => fn,
}));

import { readSnapshotFromDb } from "./server";

const COMPUTED_AT = new Date().toISOString();

function createFahamSnapshot(metric: "coveragePct" | "exposureProgressPct") {
  return {
    blockedReason: null,
    [metric]: 20,
    dueCount: 5,
    encounteredWordCount: 200,
    eligibleNewCount: 12,
    focusWordLimit: 1000,
    levelProgress: {
      activeLevel: 1,
      activeWordLimit: 1000,
      isMaxLevel: false,
      lemmaUnlocked: false,
      maxLevel: 4,
      nextLevel: 2,
      nextWordLimit: 2000,
      unlockFoundProgress: 200,
      unlockFoundRequired: 600,
      unlockMasteredProgress: 80,
      unlockMasteredRequired: 120,
      unlockReady: false,
    },
    masteredWordCount: 80,
    reviewedWordCount: 140,
    totalCandidateCount: 400,
    totalWords: 1000,
  };
}

function createStoredSnapshot(metric: "coveragePct" | "exposureProgressPct") {
  return {
    dashboardSnapshot: {
      activity: null,
      faham: createFahamSnapshot(metric),
      hifz: null,
      read: null,
      tema: null,
    },
    snapshotComputedAt: COMPUTED_AT,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  repositoryMocks.storeHomeDashboardSnapshot.mockResolvedValue(undefined);
});

describe("readSnapshotFromDb", () => {
  it("returns and persists the normalized shape for a legacy profile snapshot", async () => {
    repositoryMocks.getHomeStoredDashboardSnapshot.mockResolvedValue(
      createStoredSnapshot("coveragePct"),
    );

    const snapshot = await readSnapshotFromDb("user-legacy");

    expect(snapshot?.faham?.exposureProgressPct).toBe(20);
    expect(repositoryMocks.storeHomeDashboardSnapshot).toHaveBeenCalledOnce();
    const [userId, persistedSnapshot, computedAt] =
      repositoryMocks.storeHomeDashboardSnapshot.mock.calls[0];
    expect(userId).toBe("user-legacy");
    expect(computedAt).toBe(COMPUTED_AT);
    expect(JSON.stringify(persistedSnapshot)).toContain('"exposureProgressPct":20');
    expect(JSON.stringify(persistedSnapshot)).not.toContain('"coveragePct"');
  });

  it("does not rewrite an already current profile snapshot", async () => {
    repositoryMocks.getHomeStoredDashboardSnapshot.mockResolvedValue(
      createStoredSnapshot("exposureProgressPct"),
    );

    const snapshot = await readSnapshotFromDb("user-current");

    expect(snapshot?.faham?.exposureProgressPct).toBe(20);
    expect(repositoryMocks.storeHomeDashboardSnapshot).not.toHaveBeenCalled();
  });

  it("still returns normalized data when the best-effort rewrite fails", async () => {
    const migrationError = new Error("write unavailable");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    repositoryMocks.getHomeStoredDashboardSnapshot.mockResolvedValue(
      createStoredSnapshot("coveragePct"),
    );
    repositoryMocks.storeHomeDashboardSnapshot.mockRejectedValue(migrationError);

    try {
      const snapshot = await readSnapshotFromDb("user-legacy");

      expect(snapshot?.faham?.exposureProgressPct).toBe(20);
      expect(consoleError).toHaveBeenCalledWith(
        "[homeDashboardDb] legacy snapshot migration failed:",
        migrationError,
      );
    } finally {
      consoleError.mockRestore();
    }
  });
});
