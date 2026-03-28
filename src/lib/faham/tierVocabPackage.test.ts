import assert from "node:assert/strict";
import test from "node:test";
import { CACHE_DATA } from "@/lib/pwa/offlineBundle";
import {
  clearCachedFahamTierVocabPackage,
  loadCachedFahamTierVocabPackage,
  prefetchFahamTierVocabPackage,
} from "./tierVocabPackage";

const TEST_ORIGIN = "https://miftah.test";

function createStorageMock(): Storage {
  const store = new Map<string, string>();
  return {
    get length(): number {
      return store.size;
    },
    clear(): void {
      store.clear();
    },
    getItem(key: string): string | null {
      return store.has(key) ? store.get(key) ?? null : null;
    },
    key(index: number): string | null {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string): void {
      store.delete(key);
    },
    setItem(key: string, value: string): void {
      store.set(key, value);
    },
  };
}

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

  async match(request: RequestInfo | URL): Promise<Response | undefined> {
    const key = toAbsoluteUrl(request, this.origin);
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

  async delete(request: RequestInfo | URL): Promise<boolean> {
    const key = toAbsoluteUrl(request, this.origin);
    return this.entries.delete(key);
  }
}

class FakeCacheStorage {
  private readonly stores = new Map<string, FakeCache>();

  constructor(private readonly origin: string) {}

  async open(name: string): Promise<FakeCache> {
    const existing = this.stores.get(name);
    if (existing) {
      return existing;
    }

    const created = new FakeCache(this.origin);
    this.stores.set(name, created);
    return created;
  }

  reset(): void {
    this.stores.clear();
  }
}

const storage = createStorageMock();
const fakeCaches = new FakeCacheStorage(TEST_ORIGIN);

const successfulPayload = {
  ok: true,
  dataVersion: "1",
  generatedAt: new Date().toISOString(),
  level: 1,
  maxLevel: 4,
  wordLimit: 1000,
  words: [
    {
      id: 1,
      frequency: 1000,
      textSimple: "bism",
      textUthmani: "بِسْمِ",
      translationBm: "Dengan nama",
      translationEn: "In the name",
      transliteration: "bismi",
    },
  ],
};

test.beforeEach(() => {
  storage.clear();
  fakeCaches.reset();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage,
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      location: { origin: TEST_ORIGIN },
    },
  });
  Object.defineProperty(globalThis, "caches", {
    configurable: true,
    value: fakeCaches,
  });
});

test("prefetchFahamTierVocabPackage caches successful payload and can be read back", async () => {
  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    value: async () => new Response(JSON.stringify(successfulPayload), { status: 200 }),
  });

  const result = await prefetchFahamTierVocabPackage({
    appBuildId: "build-1",
    dataVersion: "1",
    requestedWordLimit: 1000,
  });
  assert.equal(result.status, "cached");
  assert.equal(result.wordLimit, 1000);

  const cached = await loadCachedFahamTierVocabPackage({
    appBuildId: "build-1",
    dataVersion: "1",
    requestedWordLimit: 1000,
  });
  assert.ok(cached);
  assert.equal(cached?.words.length, 1);
  assert.equal(cached?.wordLimit, 1000);
});

test("prefetchFahamTierVocabPackage returns already-current when marker is valid", async () => {
  let fetchCalls = 0;
  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    value: async () => {
      fetchCalls += 1;
      return new Response(JSON.stringify(successfulPayload), { status: 200 });
    },
  });

  await prefetchFahamTierVocabPackage({
    appBuildId: "build-2",
    dataVersion: "1",
    requestedWordLimit: 1000,
  });
  const second = await prefetchFahamTierVocabPackage({
    appBuildId: "build-2",
    dataVersion: "1",
    requestedWordLimit: 500,
  });

  assert.equal(second.status, "already-current");
  assert.equal(fetchCalls, 1);
});

test("prefetchFahamTierVocabPackage skips unauthenticated response", async () => {
  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    value: async () =>
      new Response(
        JSON.stringify({
          ok: false,
          reason: "unauthenticated",
          dataVersion: "1",
        }),
        { status: 200 },
      ),
  });

  const result = await prefetchFahamTierVocabPackage({
    appBuildId: "build-3",
    dataVersion: "1",
  });
  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "unauthenticated");
});

test("clearCachedFahamTierVocabPackage removes tier-vocab cache entries", async () => {
  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    value: async () => new Response(JSON.stringify(successfulPayload), { status: 200 }),
  });

  await prefetchFahamTierVocabPackage({
    appBuildId: "build-4",
    dataVersion: "1",
    requestedWordLimit: 1000,
  });

  const cache = await caches.open(CACHE_DATA);
  const beforeKeys = await cache.keys();
  assert.ok(beforeKeys.length > 0);

  await clearCachedFahamTierVocabPackage();
  const afterKeys = await cache.keys();
  assert.equal(afterKeys.length, 0);
});
