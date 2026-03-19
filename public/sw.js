// Miftah PWA Service Worker
// BUILD_ID and CDN_ASSET_VERSION are injected at build time by scripts/inject-build-id.ts
const BUILD_ID = "__BUILD_ID__";
const CDN_ASSET_VERSION = "__CDN_ASSET_VERSION__";

// Full SW implementation will be added in Task 9.
// For now, preserve existing audio caching behavior.
const AUDIO_CACHE = "miftah-audio-v1";
const AUDIO_HOST = "everyayah.com";

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (!url.hostname.includes(AUDIO_HOST)) return;
  event.respondWith(
    caches.open(AUDIO_CACHE).then(async (cache) => {
      const cached = await cache.match(event.request);
      if (cached) return cached;
      const response = await fetch(event.request);
      if (response.ok) cache.put(event.request, response.clone());
      return response;
    }),
  );
});
