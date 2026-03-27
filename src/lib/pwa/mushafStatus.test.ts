import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

// Mock localStorage before importing module
const store: Record<string, string> = {};
const mockLocalStorage = {
  getItem: (key: string): string | null => store[key] ?? null,
  setItem: (key: string, value: string): void => {
    store[key] = value;
  },
  removeItem: (key: string): void => {
    delete store[key];
  },
  clear: (): void => {
    for (const key of Object.keys(store)) delete store[key];
  },
  get length() {
    return Object.keys(store).length;
  },
  key: (_index: number): string | null => null,
};
(globalThis as unknown as Record<string, unknown>).localStorage = mockLocalStorage;

import {
  TOTAL_PAGES,
  LS_KEY_DOWNLOADED,
  markMushafDownloaded,
  clearMushafDownloaded,
  hasUserStartedDownload,
  setDownloadStarted,
  isPromptDismissed,
  dismissPrompt,
} from "./mushafStatus.ts";

describe("TOTAL_PAGES", () => {
  it("equals 604", () => {
    assert.equal(TOTAL_PAGES, 604);
  });
});

describe("LS_KEY_DOWNLOADED", () => {
  it("is the expected localStorage key", () => {
    assert.equal(LS_KEY_DOWNLOADED, "miftah:mushaf-downloaded");
  });
});

describe("markMushafDownloaded / clearMushafDownloaded", () => {
  beforeEach(() => {
    mockLocalStorage.clear();
  });

  it("sets and reads the downloaded version", () => {
    markMushafDownloaded("5", "1");
    assert.equal(store["miftah:mushaf-downloaded"], "5:1");
  });

  it("clearMushafDownloaded removes downloaded flag and started flag", () => {
    markMushafDownloaded("5", "1");
    setDownloadStarted();
    clearMushafDownloaded();
    assert.equal(store["miftah:mushaf-downloaded"], undefined);
    assert.equal(store["miftah:mushaf-download-started"], undefined);
  });
});

describe("hasUserStartedDownload / setDownloadStarted", () => {
  beforeEach(() => {
    mockLocalStorage.clear();
  });

  it("returns false when nothing is set", () => {
    assert.equal(hasUserStartedDownload(), false);
  });

  it("returns true after setDownloadStarted", () => {
    setDownloadStarted();
    assert.equal(hasUserStartedDownload(), true);
  });
});

describe("isPromptDismissed / dismissPrompt", () => {
  beforeEach(() => {
    mockLocalStorage.clear();
  });

  it("returns false when nothing is set", () => {
    assert.equal(isPromptDismissed(), false);
  });

  it("returns true immediately after dismissPrompt", () => {
    dismissPrompt();
    assert.equal(isPromptDismissed(), true);
  });

  it("returns false for a timestamp older than 24 hours", () => {
    const twentyFiveHoursAgo = Date.now() - 25 * 60 * 60 * 1000;
    store["miftah:mushaf-dismissed"] = String(twentyFiveHoursAgo);
    assert.equal(isPromptDismissed(), false);
  });

  it("returns false for invalid timestamp", () => {
    store["miftah:mushaf-dismissed"] = "not-a-number";
    assert.equal(isPromptDismissed(), false);
  });
});

describe("markMushafDownloaded with composite version", () => {
  beforeEach(() => {
    mockLocalStorage.clear();
  });

  it("stores composite format cdnVersion:temaVersion", () => {
    markMushafDownloaded("4", "1");
    assert.equal(store["miftah:mushaf-downloaded"], "4:1");
  });
});

// Note: isMushafDownloaded depends on the Cache API which is not available
// in Node. It is tested through manual/e2e testing in the browser.
