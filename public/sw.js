// Miftah PWA Service Worker — multi-cache router with URL allowlist
// BUILD_ID and CDN_ASSET_VERSION injected at prebuild time
const BUILD_ID = "c59008e";
const CDN_ASSET_VERSION = "4";

const APP_SHELL_CACHE = `app-shell-${BUILD_ID}`;
const MUSHAF_IMAGES_CACHE = "mushaf-images-v1";
const MUSHAF_DATA_CACHE = "mushaf-data-v1";
const AUDIO_CACHE = "miftah-audio-v1";
const TEMA_DATA_CACHE = "tema-data-v1";

const APP_SHELL_PRECACHE = ["/offline.html"];

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
  if (url.pathname.startsWith("/api/mushaf/")) return true;
  if (url.hostname !== self.location.hostname && url.pathname.endsWith(".webp")) return true;
  return false;
}

function matchesMushafData(url) {
  if (url.hostname !== self.location.hostname && url.pathname.endsWith(".manifest.json")) return true;
  if (url.pathname.startsWith("/translations/page-") && url.pathname.endsWith(".json")) return true;
  if (url.pathname.startsWith("/layouts/page-") && url.pathname.endsWith(".json")) return true;
  return false;
}

function matchesAppShell(url) {
  return url.pathname.startsWith("/_next/static/");
}

function matchesAudio(url) {
  return url.hostname.includes("everyayah.com");
}

function matchesTemaData(url) {
  return url.pathname.startsWith("/api/tema/");
}

async function cacheFirstStrategy(cacheName, request) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
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
  } catch (error) {
    return new Response(JSON.stringify({ error: "Offline" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }
}

// --- Fetch ---
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Navigation: network-first, cache HTML for offline, fallback to offline shell
  if (isNavigationRequest(event.request)) {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(event.request);
          if (response.ok) {
            const cache = await caches.open(APP_SHELL_CACHE);
            await cache.put(event.request, response.clone());
          }
          return response;
        } catch {
          // Network failed — try cached HTML, then offline.html
          const cache = await caches.open(APP_SHELL_CACHE);
          const cached = await cache.match(event.request);
          if (cached) return cached;
          const offline = await caches.match("/offline.html");
          return offline || new Response("Offline", { status: 503 });
        }
      })()
    );
    return;
  }

  // Mushaf images (WebP, page API)
  if (matchesMushafImage(url)) {
    event.respondWith(cacheFirstStrategy(MUSHAF_IMAGES_CACHE, event.request));
    return;
  }

  // Mushaf data (manifests, layouts, translations)
  if (matchesMushafData(url)) {
    event.respondWith(cacheFirstStrategy(MUSHAF_DATA_CACHE, event.request));
    return;
  }

  // App shell static assets
  if (matchesAppShell(url)) {
    event.respondWith(cacheFirstStrategy(APP_SHELL_CACHE, event.request));
    return;
  }

  // Audio
  if (matchesAudio(url)) {
    event.respondWith(cacheFirstStrategy(AUDIO_CACHE, event.request));
    return;
  }

  // Tema data
  if (matchesTemaData(url)) {
    event.respondWith(cacheFirstTema(event.request));
    return;
  }

  // Everything else: network-only (RSC, API routes, etc.)
});
