// Minimal service worker for offline audio caching (hifz feature).
// Strategy: cache-first for everyayah.com audio files.

const CACHE_NAME = "miftah-audio-v1";
const AUDIO_HOST = "everyayah.com";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Only intercept audio requests from everyayah.com
  if (!url.hostname.includes(AUDIO_HOST)) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(event.request);
      if (cached) return cached;

      const response = await fetch(event.request);
      if (response.ok) {
        cache.put(event.request, response.clone());
      }
      return response;
    })
  );
});
