import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import vm from "node:vm";
import {
  SW_TEMPLATE_PATH,
  renderPwaArtifacts,
} from "../../../scripts/render-pwa-artifacts";

type EventHandler = (event: Record<string, unknown>) => void;

interface RuntimeOptions {
  readonly cacheKeys?: readonly string[];
  readonly cachePut?: (request: Request, response: Response) => Promise<void>;
  readonly fetch: (request: Request) => Promise<Response>;
}

function createRenderedWorkerRuntime(options: RuntimeOptions) {
  const handlers = new Map<string, EventHandler[]>();
  const deletedCaches: string[] = [];
  const cachePutCalls: Array<{ request: Request; response: Response }> = [];
  const cache = {
    match: async () => undefined,
    put: async (request: Request, response: Response) => {
      cachePutCalls.push({ request, response });
      await options.cachePut?.(request, response);
    },
  };
  const cacheStorage = {
    delete: async (name: string) => {
      deletedCaches.push(name);
      return true;
    },
    keys: async () => [...(options.cacheKeys ?? [])],
    match: async () => undefined,
    open: async () => cache,
  };
  const workerGlobal = {
    addEventListener(type: string, handler: EventHandler) {
      handlers.set(type, [...(handlers.get(type) ?? []), handler]);
    },
    clients: { claim: async () => undefined },
    location: { hostname: "miftah.test" },
    skipWaiting: async () => undefined,
  };
  const rendered = renderPwaArtifacts({
    appBuildId: "abc1234",
    environment: { NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co" },
    serviceWorkerTemplate: readFileSync(SW_TEMPLATE_PATH, "utf-8"),
  });

  vm.runInNewContext(rendered.serviceWorker, {
    AbortController,
    Promise,
    Request,
    Response,
    URL,
    caches: cacheStorage,
    clearTimeout,
    fetch: options.fetch,
    self: workerGlobal,
    setTimeout,
  });

  async function dispatchFetch(request: Request): Promise<Response> {
    let responsePromise: Promise<Response> | undefined;
    const handler = handlers.get("fetch")?.[0];
    assert.ok(handler, "rendered worker did not register a fetch handler");
    handler({
      request,
      respondWith(response: Promise<Response>) {
        responsePromise = Promise.resolve(response);
      },
      waitUntil() {},
    });
    assert.ok(responsePromise, "rendered worker did not respond to the request");
    return responsePromise;
  }

  async function dispatchActivate(): Promise<void> {
    let activation: Promise<unknown> | undefined;
    const handler = handlers.get("activate")?.[0];
    assert.ok(handler, "rendered worker did not register an activate handler");
    handler({
      waitUntil(promise: Promise<unknown>) {
        activation = promise;
      },
    });
    assert.ok(activation);
    await activation;
  }

  return { cachePutCalls, deletedCaches, dispatchActivate, dispatchFetch };
}

function audioRequest(headers?: HeadersInit): Request {
  return new Request("https://everyayah.com/data/reciter/001001.mp3", { headers });
}

describe("rendered service-worker audio behavior", () => {
  it("returns an HTTP 206 ranged response without reading or writing Cache API", async () => {
    const runtime = createRenderedWorkerRuntime({
      fetch: async () =>
        new Response("partial", {
          headers: { "Content-Range": "bytes 0-6/20" },
          status: 206,
        }),
    });

    const response = await runtime.dispatchFetch(
      audioRequest({ Range: "bytes=0-6" }),
    );

    assert.equal(response.status, 206);
    assert.equal(await response.text(), "partial");
    assert.equal(runtime.cachePutCalls.length, 0);
  });

  it("caches and returns a successful full audio response", async () => {
    const runtime = createRenderedWorkerRuntime({
      fetch: async () => new Response("full audio", { status: 200 }),
    });

    const response = await runtime.dispatchFetch(audioRequest());

    assert.equal(response.status, 200);
    assert.equal(await response.text(), "full audio");
    assert.equal(runtime.cachePutCalls.length, 1);
  });

  it("returns the successful network response when Cache.put fails", async () => {
    const runtime = createRenderedWorkerRuntime({
      cachePut: async () => {
        throw new DOMException("quota", "QuotaExceededError");
      },
      fetch: async () => new Response("still usable", { status: 200 }),
    });

    const response = await runtime.dispatchFetch(audioRequest());

    assert.equal(response.status, 200);
    assert.equal(await response.text(), "still usable");
    assert.equal(runtime.cachePutCalls.length, 1);
  });

  it("returns a real 503 only when the audio network fetch fails", async () => {
    const runtime = createRenderedWorkerRuntime({
      fetch: async () => {
        throw new TypeError("offline");
      },
    });

    const response = await runtime.dispatchFetch(audioRequest());

    assert.equal(response.status, 503);
    assert.equal(await response.text(), "Network error");
    assert.equal(runtime.cachePutCalls.length, 0);
  });
});

describe("rendered service-worker activation", () => {
  it("removes only stale app shells and preserves every content-cache version", async () => {
    const contentCaches = [
      "miftah-offline-bundle-v1",
      "mushaf-images-v1",
      "mushaf-data-v1",
      "mushaf-data-v2",
      "miftah-audio-v1",
      "tema-data-v0",
      "tema-data-v1",
    ];
    const runtime = createRenderedWorkerRuntime({
      cacheKeys: ["app-shell-old", "app-shell-abc1234", ...contentCaches],
      fetch: async () => new Response("unused"),
    });

    await runtime.dispatchActivate();

    assert.deepEqual(runtime.deletedCaches, ["app-shell-old"]);
    for (const cacheName of contentCaches) {
      assert.ok(!runtime.deletedCaches.includes(cacheName));
    }
  });
});
