import test from "node:test";
import assert from "node:assert/strict";
import { defaultReadMode, loadReadMode, saveReadMode } from "./readMode";

function createMemoryStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem(key: string): string | null {
      return store.has(key) ? store.get(key) ?? null : null;
    },
    setItem(key: string, value: string): void {
      store.set(key, value);
    },
  };
}

test("defaultReadMode is read", () => {
  assert.equal(defaultReadMode(), "read");
});

test("loadReadMode returns default on empty storage", () => {
  const storage = createMemoryStorage();
  assert.equal(loadReadMode(storage), "read");
});

test("saveReadMode persists valid modes", () => {
  const storage = createMemoryStorage();

  assert.equal(saveReadMode("faham", storage), true);
  assert.equal(loadReadMode(storage), "faham");

  assert.equal(saveReadMode("tema", storage), true);
  assert.equal(loadReadMode(storage), "tema");

  assert.equal(saveReadMode("hifz", storage), true);
  assert.equal(loadReadMode(storage), "hifz");
});

test("legacy study value is normalized to faham", () => {
  const storage = createMemoryStorage({ "miftah.read.mode.v1": "study" });
  assert.equal(loadReadMode(storage), "faham");
});

test("legacy theme value is normalized to tema", () => {
  const storage = createMemoryStorage({ "miftah.read.mode.v1": "theme" });
  assert.equal(loadReadMode(storage), "tema");
});

test("invalid raw value falls back to read", () => {
  const storage = createMemoryStorage({ "miftah.read.mode.v1": "invalid" });
  assert.equal(loadReadMode(storage), "read");
});
