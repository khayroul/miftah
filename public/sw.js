// Miftah PWA Service Worker — multi-cache router with URL allowlist
// BUILD_ID and CDN_ASSET_VERSION injected at prebuild time
const BUILD_ID = "__BUILD_ID__";
const CDN_ASSET_VERSION = "__CDN_ASSET_VERSION__";

const NAVIGATION_NETWORK_TIMEOUT_MS = 2500;

const APP_SHELL_CACHE = `app-shell-${BUILD_ID}`;
const OFFLINE_BUNDLE_CACHE = "miftah-offline-bundle-v1";
const MUSHAF_IMAGES_CACHE = "mushaf-images-v1";
const MUSHAF_DATA_CACHE = "mushaf-data-v1";
const AUDIO_CACHE = "miftah-audio-v1";
const TEMA_DATA_CACHE = "tema-data-v1";

const APP_SHELL_PRECACHE = [
  "/",
  "/offline.html",
  "/manifest.webmanifest",
  "/pwa-config.json",
  "/icons/apple-touch-icon.png",
  "/icons/icon-192.png",
  "/icons/icon-192-maskable.png",
  "/icons/icon-512.png",
  "/icons/icon-512-maskable.png",
  "/images/surah-frame-ios.png",
  "/mushaf/ayah-end-marker-quran-ios.png",
];

// --- Install ---
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE).then((cache) => cache.addAll(APP_SHELL_PRECACHE))
  );
  // Do NOT call skipWaiting() — wait for user consent via update banner
});

// --- Activate ---
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter(
            (key) =>
              (key.startsWith("app-shell-") && key !== APP_SHELL_CACHE) ||
              (key.startsWith("tema-data-") && key !== TEMA_DATA_CACHE)
          )
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// --- Message ---
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// --- Fetch helpers ---
function isNavigationRequest(request) {
  return request.mode === "navigate";
}

function matchesMushafImage(url) {
  if (
    /^\/api\/mushaf\/(page\/\d+|ayah\/\d+\/\d+|word\/\d+)$/.test(url.pathname)
  ) {
    return true;
  }
  if (url.hostname !== self.location.hostname && url.pathname.endsWith(".webp")) return true;
  return false;
}

function matchesMushafData(url) {
  if (/^\/api\/mushaf\/manifest\/\d+$/.test(url.pathname)) return true;
  if (url.hostname !== self.location.hostname && url.pathname.endsWith(".manifest.json")) return true;
  if (url.pathname.startsWith("/translations/page-") && url.pathname.endsWith(".json")) return true;
  if (url.pathname.startsWith("/layouts/page-") && url.pathname.endsWith(".json")) return true;
  return false;
}

function matchesAppShell(url) {
  if (url.pathname.startsWith("/_next/static/")) return true;
  if (url.pathname.startsWith("/fonts/")) return true;
  if (url.pathname.startsWith("/icons/")) return true;
  if (url.pathname.startsWith("/images/")) return true;
  if (url.pathname.startsWith("/mushaf/")) return true;
  return (
    url.pathname === "/manifest.webmanifest" ||
    url.pathname === "/pwa-config.json"
  );
}

function matchesAudio(url) {
  return url.hostname.includes("everyayah.com");
}

function matchesTemaData(url) {
  return url.pathname.startsWith("/api/tema/");
}

function canonicalizePathname(pathname) {
  if (pathname.length > 1) {
    return pathname.replace(/\/+$/, "");
  }

  return pathname;
}

function isReadRoutePath(pathname) {
  return /^\/read\/\d+$/.test(canonicalizePathname(pathname));
}

function isTemaRoutePath(pathname) {
  return /^\/read\/surah\/\d+\/themes$/.test(canonicalizePathname(pathname));
}

function shouldUseNavigationCacheFirst(url) {
  return (
    url.pathname === "/" ||
    isReadRoutePath(url.pathname) ||
    isTemaRoutePath(url.pathname)
  );
}

function normalizeNavigationCacheKey(requestUrl) {
  const url = new URL(requestUrl);
  return `${url.origin}${canonicalizePathname(url.pathname)}`;
}

function buildNavigationCacheKeys(requestUrl) {
  const url = new URL(requestUrl);
  const canonicalKey = normalizeNavigationCacheKey(requestUrl);
  const candidates = [canonicalKey];
  const rawKey = `${url.origin}${url.pathname}`;

  if (!candidates.includes(rawKey)) {
    candidates.push(rawKey);
  }

  if (url.pathname.length > 1 && !url.pathname.endsWith("/")) {
    const trailingSlashKey = `${url.origin}${url.pathname}/`;
    if (!candidates.includes(trailingSlashKey)) {
      candidates.push(trailingSlashKey);
    }
  }

  return candidates;
}

async function matchAcrossCaches(cacheNames, requests, options) {
  const candidates = Array.isArray(requests) ? requests : [requests];
  for (const cacheName of cacheNames) {
    const cache = await caches.open(cacheName);
    for (const request of candidates) {
      const cached = await cache.match(request, options);
      if (cached) return cached;
    }
  }
  return undefined;
}

async function cacheFirstStrategy(cacheNames, targetCacheName, request, options) {
  const cached = await matchAcrossCaches(cacheNames, request, options);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(targetCacheName);
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response("Network error", { status: 503 });
  }
}

async function cacheFirstTema(request) {
  const cache = await caches.open(TEMA_DATA_CACHE);
  const cached = await cache.match(request, { ignoreVary: true });
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response(JSON.stringify({ error: "Offline" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }
}

async function fetchAndCacheNavigation(request, navigationKey) {
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    NAVIGATION_NETWORK_TIMEOUT_MS,
  );

  try {
    const response = await fetch(request, {
      signal: controller.signal,
    });
    if (response.ok) {
      const cache = await caches.open(APP_SHELL_CACHE);
      await cache.put(navigationKey, response.clone());
    }
    return response;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

// --- Fetch ---
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Navigation:
  // - Reader routes: cache-first + background revalidation for instant page turns
  // - Other routes: network-first with offline fallback
  if (isNavigationRequest(event.request)) {
    event.respondWith(
      (async () => {
        const navigationKeys = buildNavigationCacheKeys(event.request.url);
        const navigationKey = navigationKeys[0];
        const navigationCacheNames = [APP_SHELL_CACHE, OFFLINE_BUNDLE_CACHE];

        if (shouldUseNavigationCacheFirst(url)) {
          const cached = await matchAcrossCaches(
            navigationCacheNames,
            navigationKeys,
            { ignoreSearch: true },
          );
          const networkPromise = fetchAndCacheNavigation(
            event.request,
            navigationKey,
          );

          if (cached) {
            event.waitUntil(networkPromise.then(() => undefined));
            return cached;
          }

          const networkResponse = await networkPromise;
          if (networkResponse) {
            return networkResponse;
          }

          const offline = await caches.match("/offline.html");
          return offline || new Response("Offline", { status: 503 });
        }

        const networkResponse = await fetchAndCacheNavigation(
          event.request,
          navigationKey,
        );
        if (networkResponse) {
          return networkResponse;
        }

        const cached = await matchAcrossCaches(
          navigationCacheNames,
          navigationKeys,
          { ignoreSearch: true },
        );
        if (cached) {
          return cached;
        }

        const offline = await caches.match("/offline.html");
        return offline || new Response("Offline", { status: 503 });
      })()
    );
    return;
  }

  // Mushaf images (WebP, page API)
  if (matchesMushafImage(url)) {
    event.respondWith(
      cacheFirstStrategy([MUSHAF_IMAGES_CACHE], MUSHAF_IMAGES_CACHE, event.request),
    );
    return;
  }

  // Mushaf data (manifests, layouts, translations)
  if (matchesMushafData(url)) {
    event.respondWith(
      cacheFirstStrategy([MUSHAF_DATA_CACHE], MUSHAF_DATA_CACHE, event.request),
    );
    return;
  }

  // App shell static assets
  if (matchesAppShell(url)) {
    event.respondWith(
      cacheFirstStrategy(
        [APP_SHELL_CACHE, OFFLINE_BUNDLE_CACHE],
        APP_SHELL_CACHE,
        event.request,
      ),
    );
    return;
  }

  // Audio
  if (matchesAudio(url)) {
    event.respondWith(
      cacheFirstStrategy([AUDIO_CACHE], AUDIO_CACHE, event.request),
    );
    return;
  }

  // Tema data
  if (matchesTemaData(url)) {
    event.respondWith(cacheFirstTema(event.request));
    return;
  }

  // Everything else: network-only (RSC, API routes, etc.)
});
