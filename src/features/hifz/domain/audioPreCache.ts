const CACHE_NAME = "miftah-audio-v1";

export async function preCacheAudioUrls(urls: string[]): Promise<void> {
  if (typeof window === "undefined" || !("caches" in window)) return;

  try {
    const cache = await caches.open(CACHE_NAME);

    for (const url of urls) {
      const exists = await cache.match(url);
      if (!exists) {
        try {
          const response = await fetch(url);
          if (response.ok) {
            await cache.put(url, response);
          }
        } catch {
          // Network failure for this URL — skip
        }
      }
    }
  } catch {
    // Cache API not available or quota exceeded
  }
}

export async function clearAudioCache(): Promise<void> {
  if (typeof window === "undefined" || !("caches" in window)) return;
  try {
    await caches.delete(CACHE_NAME);
  } catch {
    // Ignore
  }
}
