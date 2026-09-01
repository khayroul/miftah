import { describe, expect, it } from "vitest";
import {
  buildAyahKeysForRange,
  resolvePassageLocation,
} from "./passageNavigation";

describe("buildAyahKeysForRange", () => {
  it("builds a same-surah ayah range", () => {
    expect(buildAyahKeysForRange(2, 255, 257)).toEqual([
      "2:255",
      "2:256",
      "2:257",
    ]);
  });

  it("rejects a reversed range", () => {
    expect(buildAyahKeysForRange(2, 10, 8)).toEqual([]);
  });
});

describe("resolvePassageLocation", () => {
  it("resolves an ayah range to its Mushaf pages", async () => {
    await expect(resolvePassageLocation(2, 255, 257)).resolves.toEqual({
      startPage: 42,
      endPage: 43,
    });
  });
});
