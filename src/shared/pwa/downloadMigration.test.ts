import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { migrateIfVersionChanged } from "./downloadMigration";
import {
  CACHE_BUNDLE,
  CACHE_DATA,
  CACHE_IMAGES,
  CACHE_TEMA,
} from "./offlineBundle";
import { LS_KEY_DOWNLOADED } from "./mushafStatus";
import type {
  OptionalOfflineCacheHooks,
  OptionalOfflineCacheMarker,
} from "./optionalCacheHooks";

const storage = new Map<string, string>();
const deletedCaches: string[] = [];

function createOptionalCache(marker: OptionalOfflineCacheMarker | null = null) {
  let clearCalls = 0;
  const hooks: OptionalOfflineCacheHooks = {
    clear: async () => {
      clearCalls += 1;
    },
    getMarker: () => marker,
    prefetch: async () => undefined,
  };
  return { hooks, readClearCalls: () => clearCalls };
}

beforeEach(() => {
  storage.clear();
  deletedCaches.length = 0;
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      removeItem: (key: string) => storage.delete(key),
      setItem: (key: string, value: string) => storage.set(key, value),
    },
  });
  Object.defineProperty(globalThis, "caches", {
    configurable: true,
    value: {
      delete: async (name: string) => {
        deletedCaches.push(name);
        return true;
      },
    },
  });
});

describe("optional offline cache migration hooks", () => {
  it("clears the injected cache when the CDN asset version changes", async () => {
    storage.set(LS_KEY_DOWNLOADED, "old:1:2:build");
    const optionalCache = createOptionalCache();

    await migrateIfVersionChanged("4", "1", "7", "build", optionalCache.hooks);

    assert.equal(optionalCache.readClearCalls(), 1);
    assert.deepEqual(deletedCaches, [CACHE_IMAGES, CACHE_DATA, CACHE_BUNDLE]);
  });

  it("clears the injected cache when the tema data version changes", async () => {
    storage.set(LS_KEY_DOWNLOADED, "4:old:2:build");
    const optionalCache = createOptionalCache();

    await migrateIfVersionChanged("4", "1", "7", "build", optionalCache.hooks);

    assert.equal(optionalCache.readClearCalls(), 1);
    assert.deepEqual(deletedCaches, [CACHE_TEMA, CACHE_BUNDLE]);
  });

  it("clears the injected cache when the download schema changes", async () => {
    storage.set(LS_KEY_DOWNLOADED, "4:1:1:build");
    const optionalCache = createOptionalCache();

    await migrateIfVersionChanged("4", "1", "7", "build", optionalCache.hooks);

    assert.equal(optionalCache.readClearCalls(), 1);
  });

  it("clears the injected cache when the app build changes", async () => {
    storage.set(LS_KEY_DOWNLOADED, "4:1:2:old-build");
    const optionalCache = createOptionalCache();

    await migrateIfVersionChanged("4", "1", "7", "build", optionalCache.hooks);

    assert.equal(optionalCache.readClearCalls(), 1);
    assert.deepEqual(deletedCaches, [CACHE_BUNDLE]);
  });

  it("clears a stale injected feature marker", async () => {
    storage.set(LS_KEY_DOWNLOADED, "4:1:2:build");
    const optionalCache = createOptionalCache({
      appBuildId: "build",
      dataVersion: "old-data",
    });

    await migrateIfVersionChanged("4", "1", "7", "build", optionalCache.hooks);

    assert.equal(optionalCache.readClearCalls(), 1);
    assert.deepEqual(deletedCaches, []);
  });
});
