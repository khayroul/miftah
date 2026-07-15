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
  readonly cacheMatch?: (request: unknown) => Promise<Response | undefined>;
  readonly cachePut?: (request: Request, response: Response) => Promise<void>;
  readonly fetch: (request: Request) => Promise<Response>;
}

function createRenderedWorkerRuntime(options: RuntimeOptions) {
  const handlers = new Map<string, EventHandler[]>();
  const deletedCaches: string[] = [];
  const cachePutCalls: Array<{ request: Request; response: Response }> = [];
  const setTimeoutDelays: number[] = [];
  const spiedSetTimeout = ((
    callback: (...args: unknown[]) => void,
    delay?: number,
  ) => {
    setTimeoutDelays.push(delay ?? 0);
    return setTimeout(callback, delay);
  }) as typeof setTimeout;
  const cache = {
    match: async (request: unknown) => options.cacheMatch?.(request),
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
    setTimeout: spiedSetTimeout,
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

  return {
    cachePutCalls,
    deletedCaches,
    dispatchActivate,
    dispatchFetch,
    setTimeoutDelays,
  };
}

/** Request-like navigation event payload (Request cannot be constructed with
 * mode:"navigate" in Node) — the worker only reads url/mode and forwards it. */
function navigationRequest(url: string): Request {
  return { mode: "navigate", url } as unknown as Request;
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

describe("rendered service-worker navigation timeouts", () => {
  it("cold visit (nothing cached): uses the long ceiling and returns a slow network page instead of the offline fallback", async () => {
    // Field bug 2026-07-15: a Vercel cold start + mobile RTT exceeded the old
    // fixed 2.5s abort, so ONLINE first-time visitors saw offline.html.
    const runtime = createRenderedWorkerRuntime({
      fetch: (request) => {
        if (String((request as Request).url).includes("offline.html")) {
          return Promise.resolve(new Response("offline page"));
        }
        return new Promise((resolve) =>
          setTimeout(() => resolve(new Response("fresh page", { status: 200 })), 20),
        );
      },
    });

    const response = await runtime.dispatchFetch(
      navigationRequest("https://miftah.test/read/1"),
    );

    assert.equal(await response.text(), "fresh page");
    // The abort budget chosen for an uncached navigation must be the cold
    // ceiling, never the 2.5s short-circuit (there is nothing to fall back to).
    assert.ok(runtime.setTimeoutDelays.includes(20000));
    assert.ok(!runtime.setTimeoutDelays.includes(2500));
  });

  it("warm visit (cached copy exists): serves the cache instantly and keeps the short revalidation budget", async () => {
    const cachedShell = new Response("cached shell", { status: 200 });
    const runtime = createRenderedWorkerRuntime({
      cacheMatch: async () => cachedShell,
      fetch: async () => new Response("network shell", { status: 200 }),
    });

    // A queryless reader document is an explicit offline cache route.
    const response = await runtime.dispatchFetch(
      navigationRequest("https://miftah.test/read/1"),
    );

    assert.equal(await response.text(), "cached shell");
    // With a fallback available, the background revalidation keeps the
    // short-circuit budget.
    assert.ok(runtime.setTimeoutDelays.includes(2500));
    assert.ok(!runtime.setTimeoutDelays.includes(20000));
  });

  it("never serves cached personalized or query-bearing navigation documents", async () => {
    const networkOnlyUrls = [
      "https://miftah.test/",
      "https://miftah.test/faham",
      "https://miftah.test/hifz",
      "https://miftah.test/tasmi/juzuk",
      "https://miftah.test/auth/sign-in?next=%2Ftasmi%2Fjuzuk",
      "https://miftah.test/read/1?flow=review&qi=0",
      "https://miftah.test/read/surah/2/themes?chunk=abc",
      "https://miftah.test/read/surah/2/themes?chunk=3&mode=private",
    ];

    for (const url of networkOnlyUrls) {
      const runtime = createRenderedWorkerRuntime({
        cacheMatch: async () => new Response("stale private page", { status: 200 }),
        fetch: async () => new Response(`fresh:${url}`, { status: 200 }),
      });

      const response = await runtime.dispatchFetch(navigationRequest(url));

      assert.equal(await response.text(), `fresh:${url}`);
      assert.equal(runtime.cachePutCalls.length, 0);
      assert.ok(!runtime.setTimeoutDelays.includes(2500));
      assert.ok(!runtime.setTimeoutDelays.includes(20000));
    }
  });

  it("serves a downloaded Tema shell for a valid offline chunk selection", async () => {
    const runtime = createRenderedWorkerRuntime({
      cacheMatch: async () => new Response("downloaded Tema shell", { status: 200 }),
      fetch: async () => {
        throw new TypeError("offline");
      },
    });

    const response = await runtime.dispatchFetch(
      navigationRequest("https://miftah.test/read/surah/2/themes?chunk=3"),
    );

    assert.equal(await response.text(), "downloaded Tema shell");
    assert.ok(runtime.setTimeoutDelays.includes(2500));
  });

  it("does not cache a queryless reader response marked private and no-store", async () => {
    const runtime = createRenderedWorkerRuntime({
      fetch: async () =>
        new Response("private reader", {
          headers: { "Cache-Control": "private, no-store" },
          status: 200,
        }),
    });

    const response = await runtime.dispatchFetch(
      navigationRequest("https://miftah.test/read/2"),
    );

    assert.equal(await response.text(), "private reader");
    assert.equal(runtime.cachePutCalls.length, 0);
  });

  it("does not cache a followed redirect under the original reader URL", async () => {
    const redirectedResponse = new Response("sign in", { status: 200 });
    Object.defineProperty(redirectedResponse, "redirected", { value: true });
    const runtime = createRenderedWorkerRuntime({
      fetch: async () => redirectedResponse,
    });

    const response = await runtime.dispatchFetch(
      navigationRequest("https://miftah.test/read/3"),
    );

    assert.equal(await response.text(), "sign in");
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
