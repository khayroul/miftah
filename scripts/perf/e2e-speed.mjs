import { chromium, devices } from "playwright";

const BASE_URL = process.env.MIFTAH_BASE_URL ?? "http://127.0.0.1:3010";
const ROUTES = (process.env.MIFTAH_SPEED_ROUTES ?? "/,/read/1")
  .split(",")
  .map((route) => route.trim())
  .filter(Boolean);
const ITERATIONS = Number.parseInt(process.env.MIFTAH_SPEED_RUNS ?? "3", 10);
const DEVICE_NAME = process.env.MIFTAH_SPEED_DEVICE ?? "Pixel 7";
const INCLUDE_OFFLINE = process.env.MIFTAH_SPEED_INCLUDE_OFFLINE !== "0";
const VERBOSE = process.env.MIFTAH_SPEED_VERBOSE === "1";
const device = devices[DEVICE_NAME];

if (!device) {
  console.error(
    `Unknown Playwright device "${DEVICE_NAME}". Set MIFTAH_SPEED_DEVICE to a valid preset.`,
  );
  process.exit(1);
}

const THROTTLE = {
  latency: 150,
  downloadThroughput: Math.floor((1.6 * 1024 * 1024) / 8),
  uploadThroughput: Math.floor((750 * 1024) / 8),
  cpuSlowdownRate: 4,
};

function round(value, digits = 1) {
  if (value == null || Number.isNaN(value)) {
    return null;
  }
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function createNetworkSummary() {
  return {
    totalBytes: 0,
    totalRequests: 0,
    byType: {},
    resources: [],
  };
}

async function setupPage(context, { offline = false } = {}) {
  const page = await context.newPage();
  const client = await context.newCDPSession(page);
  const summary = createNetworkSummary();
  const requestMap = new Map();

  await client.send("Network.enable");
  await client.send("Performance.enable");

  if (!offline) {
    await client.send("Emulation.setCPUThrottlingRate", {
      rate: THROTTLE.cpuSlowdownRate,
    });
    await client.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: THROTTLE.latency,
      downloadThroughput: THROTTLE.downloadThroughput,
      uploadThroughput: THROTTLE.uploadThroughput,
      connectionType: "cellular4g",
    });
  }

  client.on("Network.responseReceived", (event) => {
    requestMap.set(event.requestId, {
      url: event.response.url,
      status: event.response.status,
      type: event.type,
      encodedDataLength: 0,
    });
  });

  client.on("Network.loadingFinished", (event) => {
    const current = requestMap.get(event.requestId);
    if (!current) {
      return;
    }

    current.encodedDataLength = event.encodedDataLength;
    summary.totalBytes += event.encodedDataLength;
    summary.totalRequests += 1;
    summary.resources.push(current);

    const typeSummary = summary.byType[current.type] ?? {
      bytes: 0,
      count: 0,
    };
    typeSummary.bytes += event.encodedDataLength;
    typeSummary.count += 1;
    summary.byType[current.type] = typeSummary;
  });

  await page.addInitScript(() => {
    window.__miftahPerf = {
      cls: 0,
      lcp: null,
    };

    try {
      const lcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const last = entries[entries.length - 1];
        if (!last) {
          return;
        }

        window.__miftahPerf.lcp =
          last.renderTime || last.loadTime || last.startTime;
      });
      lcpObserver.observe({
        type: "largest-contentful-paint",
        buffered: true,
      });
    } catch {}

    try {
      const clsObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!entry.hadRecentInput) {
            window.__miftahPerf.cls += entry.value;
          }
        }
      });
      clsObserver.observe({
        type: "layout-shift",
        buffered: true,
      });
    } catch {}
  });

  return { client, page, summary };
}

async function captureMetrics(page, route) {
  const response = await page.goto(`${BASE_URL}${route}`, {
    timeout: 15_000,
    waitUntil: "load",
  });

  await page.waitForLoadState("networkidle", {
    timeout: 15_000,
  }).catch(() => {});
  await page.waitForTimeout(1_200);

  const metrics = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    const paints = Object.fromEntries(
      performance
        .getEntriesByType("paint")
        .map((entry) => [entry.name, entry.startTime]),
    );

    return {
      controlledBySw: Boolean(navigator.serviceWorker?.controller),
      fcp: paints["first-contentful-paint"] ?? null,
      lcp: window.__miftahPerf?.lcp ?? null,
      cls: window.__miftahPerf?.cls ?? null,
      resourceCount: performance.getEntriesByType("resource").length,
      title: document.title,
      nav: nav
        ? {
            domContentLoaded: nav.domContentLoadedEventEnd,
            duration: nav.duration,
            encodedBodySize: nav.encodedBodySize,
            loadEventEnd: nav.loadEventEnd,
            responseStart: nav.responseStart,
            transferSize: nav.transferSize,
          }
        : null,
    };
  });

  return {
    ...metrics,
    route,
    status: response?.status() ?? null,
  };
}

function summarizeTopResources(summary) {
  return [...summary.resources]
    .sort((left, right) => right.encodedDataLength - left.encodedDataLength)
    .slice(0, 8)
    .map((resource) => ({
      kb: round(resource.encodedDataLength / 1024, 1),
      type: resource.type,
      url: resource.url.replace(BASE_URL, ""),
    }));
}

function summarizeScenario(metrics, summary) {
  return {
    cls: round(metrics.cls, 3),
    controlledBySw: metrics.controlledBySw,
    domContentLoadedMs: round(metrics.nav?.domContentLoaded),
    fcpMs: round(metrics.fcp),
    lcpMs: round(metrics.lcp),
    loadMs: round(metrics.nav?.loadEventEnd),
    requests: summary.totalRequests,
    resourceEntries: metrics.resourceCount,
    status: metrics.status,
    ttfbMs: round(metrics.nav?.responseStart),
    transferKb: round(summary.totalBytes / 1024),
    topResources: summarizeTopResources(summary),
    byType: Object.fromEntries(
      Object.entries(summary.byType).map(([type, values]) => [
        type,
        {
          bytesKb: round(values.bytes / 1024),
          count: values.count,
        },
      ]),
    ),
  };
}

function createMetricSeries() {
  return {
    cls: [],
    domContentLoadedMs: [],
    fcpMs: [],
    lcpMs: [],
    loadMs: [],
    requests: [],
    ttfbMs: [],
    transferKb: [],
  };
}

function pushScenarioSeries(series, scenario) {
  if (!scenario || typeof scenario !== "object" || "error" in scenario) {
    return;
  }

  for (const key of Object.keys(series)) {
    const value = scenario[key];
    if (typeof value === "number") {
      series[key].push(value);
    }
  }
}

function median(values) {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const middleIndex = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) {
    return round(sorted[middleIndex], 2);
  }

  return round((sorted[middleIndex - 1] + sorted[middleIndex]) / 2, 2);
}

async function runWebScenario(route) {
  if (VERBOSE) {
    console.error(`[perf] web ${route}`);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ...device,
    serviceWorkers: "block",
  });
  const { page, summary } = await setupPage(context);
  const metrics = await captureMetrics(page, route);
  await browser.close();
  return summarizeScenario(metrics, summary);
}

async function runPwaScenario(route, { offline = false } = {}) {
  if (VERBOSE) {
    console.error(`[perf] pwa ${offline ? "offline" : "warm"} ${route}`);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ...device,
    serviceWorkers: "allow",
  });

  const warmup = await setupPage(context);
  await captureMetrics(warmup.page, route);
  await warmup.page.evaluate(async () => {
    if ("serviceWorker" in navigator) {
      await navigator.serviceWorker.ready;
    }
  });
  await warmup.page.waitForTimeout(1_000);

  const measured = await setupPage(context);
  const onlineMetrics = await captureMetrics(measured.page, route);

  if (offline) {
    if (!onlineMetrics.controlledBySw) {
      await browser.close();
      return {
        error: "service-worker-not-controlling-route",
      };
    }

    await context.setOffline(true);
    const offlineMetrics = await captureMetrics(measured.page, route).catch(
      (error) => ({
        error:
          error instanceof Error ? error.message : "offline-navigation-failed",
      }),
    );
    await browser.close();

    if ("error" in offlineMetrics) {
      return offlineMetrics;
    }

    return summarizeScenario(offlineMetrics, measured.summary);
  }

  await browser.close();
  return summarizeScenario(onlineMetrics, measured.summary);
}

async function main() {
  const results = [];

  for (const route of ROUTES) {
    const webSeries = createMetricSeries();
    const pwaWarmSeries = createMetricSeries();
    const pwaOfflineSeries = createMetricSeries();
    let sampleWeb = null;
    let samplePwaWarm = null;
    let samplePwaOffline = null;

    for (let run = 0; run < ITERATIONS; run += 1) {
      const web = await runWebScenario(route);
      const pwaWarm = await runPwaScenario(route);
      const pwaOffline = INCLUDE_OFFLINE
        ? await runPwaScenario(route, { offline: true })
        : null;

      sampleWeb = sampleWeb ?? web;
      samplePwaWarm = samplePwaWarm ?? pwaWarm;
      samplePwaOffline = samplePwaOffline ?? pwaOffline;

      pushScenarioSeries(webSeries, web);
      pushScenarioSeries(pwaWarmSeries, pwaWarm);
      if (pwaOffline) {
        pushScenarioSeries(pwaOfflineSeries, pwaOffline);
      }
    }

    results.push({
      route,
      iterations: ITERATIONS,
      device: DEVICE_NAME,
      throttle: THROTTLE,
      web: {
        median: Object.fromEntries(
          Object.entries(webSeries).map(([key, values]) => [key, median(values)]),
        ),
        sample: sampleWeb,
      },
      pwaWarm: {
        median: Object.fromEntries(
          Object.entries(pwaWarmSeries).map(([key, values]) => [key, median(values)]),
        ),
        sample: samplePwaWarm,
      },
      pwaOffline: {
        median: Object.fromEntries(
          Object.entries(pwaOfflineSeries).map(([key, values]) => [key, median(values)]),
        ),
        sample: samplePwaOffline,
      },
    });
  }

  console.log(JSON.stringify(results, null, 2));
}

main().catch((error) => {
  console.error("[perf:e2e-speed] failed");
  console.error(error);
  process.exit(1);
});
