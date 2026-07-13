"use client";

type UpdateCallback = () => void;

let updateCallbacks: UpdateCallback[] = [];

export function onSwUpdate(callback: UpdateCallback): () => void {
  updateCallbacks = [...updateCallbacks, callback];
  return () => {
    updateCallbacks = updateCallbacks.filter((cb) => cb !== callback);
  };
}

function notifyUpdate(): void {
  for (const callback of updateCallbacks) {
    callback();
  }
}

export function registerServiceWorker(): void {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }

  navigator.serviceWorker
    .register("/sw.js")
    .then((registration) => {
      registration.addEventListener("updatefound", () => {
        const newWorker = registration.installing;
        if (!newWorker) return;

        newWorker.addEventListener("statechange", () => {
          if (
            newWorker.state === "installed" &&
            navigator.serviceWorker.controller
          ) {
            notifyUpdate();
          }
        });
      });
    })
    .catch(() => {
      // SW registration failed — offline features won't work, but app continues
    });
}

export function skipWaitingAndReload(): void {
  if (!navigator.serviceWorker.controller) return;

  navigator.serviceWorker.ready.then((registration) => {
    if (registration.waiting) {
      registration.waiting.postMessage({ type: "SKIP_WAITING" });
    }
  });

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    window.location.reload();
  });
}
