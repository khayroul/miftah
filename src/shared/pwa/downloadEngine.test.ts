import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DOWNLOAD_PACKAGES,
  buildPageAssetUrls,
  cancelDownload,
  downloadMushaf,
  type MushafDownloadProgress,
  type OptionalOfflineCacheHooks,
  type PwaConfig,
} from "./downloadEngine";
import { TOTAL_ITEMS } from "./mushafStatus";

const TEST_CONFIG: PwaConfig = {
  cdnAssetVersion: "4",
  temaDataVersion: "1",
  supabaseStorageBase: "https://cdn.example.com/storage/v1/object/public",
  pagesBucket: "mushaf-pages",
  manifestsBucket: "mushaf-manifests",
};

const FALLBACK_CONFIG: PwaConfig = {
  cdnAssetVersion: "4",
  temaDataVersion: "1",
  supabaseStorageBase: "",
  pagesBucket: "mushaf-pages",
  manifestsBucket: "mushaf-manifests",
};

const TEST_ORIGIN = "https://miftah.test";

const localStorageStore: Record<string, string> = {};
const mockLocalStorage = {
  getItem: (key: string): string | null => localStorageStore[key] ?? null,
  setItem: (key: string, value: string): void => {
    localStorageStore[key] = value;
  },
  removeItem: (key: string): void => {
    delete localStorageStore[key];
  },
  clear: (): void => {
    for (const key of Object.keys(localStorageStore)) {
      delete localStorageStore[key];
    }
  },
  get length(): number {
    return Object.keys(localStorageStore).length;
  },
  key: (_index: number): string | null => null,
};

function toAbsoluteUrl(request: RequestInfo | URL, origin: string): string {
  if (typeof request === "string") {
    return new URL(request, origin).href;
  }
  if (request instanceof URL) {
    return request.href;
  }
  return new URL(request.url, origin).href;
}

class FakeCache {
  private readonly entries = new Map<string, Response>();

  constructor(private readonly origin: string) {}

  async match(
    request: RequestInfo | URL,
    options?: CacheQueryOptions,
  ): Promise<Response | undefined> {
    const key = toAbsoluteUrl(request, this.origin);

    if (options?.ignoreSearch) {
      const targetPathname = new URL(key).pathname;
      for (const [storedKey, storedResponse] of this.entries) {
        if (new URL(storedKey).pathname === targetPathname) {
          return storedResponse.clone();
        }
      }
      return undefined;
    }

    const response = this.entries.get(key);
    return response?.clone();
  }

  async put(request: RequestInfo | URL, response: Response): Promise<void> {
    const key = toAbsoluteUrl(request, this.origin);
    this.entries.set(key, response.clone());
  }

  async keys(): Promise<Request[]> {
    return Array.from(this.entries.keys(), (url) => new Request(url));
  }
}

class FakeCacheStorage {
  private readonly stores = new Map<string, FakeCache>();

  constructor(private readonly origin: string) {}

  async open(name: string): Promise<FakeCache> {
    const existing = this.stores.get(name);
    if (existing) return existing;

    const created = new FakeCache(this.origin);
    this.stores.set(name, created);
    return created;
  }

  async delete(name: string): Promise<boolean> {
    return this.stores.delete(name);
  }

  reset(): void {
    this.stores.clear();
  }
}

const fakeCaches = new FakeCacheStorage(TEST_ORIGIN);

const mockFetch: typeof fetch = async (
  input: RequestInfo | URL,
): Promise<Response> => {
  const url = typeof input === "string"
    ? input
    : input instanceof URL
      ? input.toString()
      : input.url;

  if (url === "/" || url.startsWith("/read/")) {
    return new Response(
      '<html><body><script src="/_next/static/app.js"></script></body></html>',
      {
      status: 200,
      headers: { "Content-Type": "text/html" },
      },
    );
  }

  return new Response("{}", {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

beforeEach(() => {
  mockLocalStorage.clear();
  fakeCaches.reset();

  Object.defineProperty(globalThis, "localStorage", {
    value: mockLocalStorage,
    configurable: true,
  });
  Object.defineProperty(globalThis, "window", {
    value: { location: { origin: TEST_ORIGIN } },
    configurable: true,
  });
  Object.defineProperty(globalThis, "navigator", {
    value: {
      storage: {
        estimate: async () => ({ quota: 500_000_000, usage: 0 }),
        persist: async () => true,
      },
    },
    configurable: true,
  });
  Object.defineProperty(globalThis, "caches", {
    value: fakeCaches,
    configurable: true,
  });
  Object.defineProperty(globalThis, "fetch", {
    value: mockFetch,
    configurable: true,
  });
});

describe("download packages", () => {
  it("defines package ordering as tema then mushaf", () => {
    assert.deepEqual(
      DOWNLOAD_PACKAGES.map((pkg) => pkg.id),
      ["tema", "mushaf"],
    );
    assert.equal(DOWNLOAD_PACKAGES[0].label, "Tema");
    assert.equal(DOWNLOAD_PACKAGES[1].label, "Mushaf");
  });

  it("emits package progress metadata and transitions from tema to mushaf", async () => {
    const events: MushafDownloadProgress[] = [];

    await downloadMushaf(FALLBACK_CONFIG, (progress) => {
      events.push(progress);

      if (
        progress.packageId === "mushaf" &&
        progress.packageCompletedItems > 0
      ) {
        cancelDownload();
      }
    });

    assert.ok(events.length > 0, "expected progress callback events");

    const first = events[0];
    assert.equal(first.packageId, "tema");
    assert.equal(first.packageLabel, "Tema");
    assert.equal(first.packageIndex, 1);
    assert.equal(first.packageCount, 2);
    assert.equal(first.totalItems, TOTAL_ITEMS);

    const mushafEvent = events.find((event) => event.packageId === "mushaf");
    assert.notEqual(mushafEvent, undefined);
    if (mushafEvent === undefined) return;

    assert.equal(mushafEvent.packageLabel, "Mushaf");
    assert.equal(mushafEvent.packageIndex, 2);
    assert.equal(mushafEvent.packageCount, 2);
    assert.ok(mushafEvent.packageTotalItems > first.packageTotalItems);
  });

  it("prefetches an injected optional cache after a successful finalization", async () => {
    const prefetchCalls: Array<{
      readonly appBuildId: string;
      readonly dataVersion: string;
    }> = [];
    const optionalCache: OptionalOfflineCacheHooks = {
      clear: async () => undefined,
      getMarker: () => null,
      prefetch: async ({ appBuildId, dataVersion }) => {
        prefetchCalls.push({ appBuildId, dataVersion });
      },
    };

    await downloadMushaf(
      {
        ...FALLBACK_CONFIG,
        appBuildId: "build-success",
        fahamDataVersion: "faham-7",
      },
      undefined,
      { optionalCache },
    );

    assert.deepEqual(prefetchCalls, [
      { appBuildId: "build-success", dataVersion: "faham-7" },
    ]);
  });
});

describe("buildPageAssetUrls", () => {
  it("page 1 — correct URLs with zero-padded page number", () => {
    const urls = buildPageAssetUrls(1, TEST_CONFIG);

    assert.equal(
      urls.webp,
      "https://cdn.example.com/storage/v1/object/public/mushaf-pages/page_001_mobile.webp?v=4",
    );
    assert.equal(
      urls.manifest,
      "https://cdn.example.com/storage/v1/object/public/mushaf-manifests/page_001.manifest.json?v=4",
    );
    assert.equal(urls.layout, "/layouts/page-001.json");
    assert.equal(urls.translation, "/translations/page-001.json");
  });

  it("page 42 — proper zero-padding in all URLs", () => {
    const urls = buildPageAssetUrls(42, TEST_CONFIG);

    assert.ok(
      urls.webp.includes("page_042_mobile.webp?v=4"),
      `webp should include page_042_mobile.webp?v=4, got: ${urls.webp}`,
    );
    assert.ok(
      urls.manifest.includes("page_042.manifest.json?v=4"),
      `manifest should include page_042.manifest.json?v=4, got: ${urls.manifest}`,
    );
    assert.equal(urls.layout, "/layouts/page-042.json");
    assert.equal(urls.translation, "/translations/page-042.json");
  });

  it("page 100 — three-digit page number (no padding needed)", () => {
    const urls = buildPageAssetUrls(100, TEST_CONFIG);

    assert.ok(urls.webp.includes("page_100_mobile.webp"));
    assert.ok(urls.manifest.includes("page_100.manifest.json"));
    assert.equal(urls.layout, "/layouts/page-100.json");
    assert.equal(urls.translation, "/translations/page-100.json");
  });

  it("page 604 — last page of mushaf", () => {
    const urls = buildPageAssetUrls(604, TEST_CONFIG);

    assert.ok(urls.webp.includes("page_604_mobile.webp"));
    assert.ok(urls.manifest.includes("page_604.manifest.json"));
    assert.equal(urls.layout, "/layouts/page-604.json");
    assert.equal(urls.translation, "/translations/page-604.json");
  });

  it("webp and manifest use underscore separator, layout and translation use dash", () => {
    const urls = buildPageAssetUrls(5, TEST_CONFIG);

    assert.ok(urls.webp.includes("page_005"), "webp must use underscore");
    assert.ok(urls.manifest.includes("page_005"), "manifest must use underscore");
    assert.ok(urls.layout.includes("page-005"), "layout must use dash");
    assert.ok(urls.translation.includes("page-005"), "translation must use dash");
  });

  it("asset version is appended to remote URLs only", () => {
    const urls = buildPageAssetUrls(1, TEST_CONFIG);

    assert.ok(urls.webp.includes("?v=4"), "webp must have version param");
    assert.ok(urls.manifest.includes("?v=4"), "manifest must have version param");
    assert.equal(
      urls.layout.includes("?v="),
      false,
      "layout (local) must NOT have version param",
    );
    assert.equal(
      urls.translation.includes("?v="),
      false,
      "translation (local) must NOT have version param",
    );
  });

  it("falls back to local API routes when supabaseStorageBase is empty", () => {
    const urls = buildPageAssetUrls(7, FALLBACK_CONFIG);

    assert.equal(urls.webp, "/api/mushaf/page/7?variant=mobile");
    assert.equal(urls.manifest, "/api/mushaf/manifest/7");
    assert.equal(urls.layout, "/layouts/page-007.json");
    assert.equal(urls.translation, "/translations/page-007.json");
  });
});
