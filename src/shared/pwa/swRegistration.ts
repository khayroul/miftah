"use client";

type UpdateCallback = () => void;

export interface ServiceWorkerLike {
  readonly state: string;
  addEventListener(type: "statechange", callback: () => void): void;
  postMessage(message: unknown): void;
}

export interface ServiceWorkerRegistrationLike {
  readonly installing: ServiceWorkerLike | null;
  readonly waiting: ServiceWorkerLike | null;
  addEventListener(type: "updatefound", callback: () => void): void;
}

export interface ServiceWorkerContainerLike {
  readonly controller: unknown | null;
  readonly ready: PromiseLike<ServiceWorkerRegistrationLike>;
  addEventListener(
    type: "controllerchange",
    callback: () => void,
    options?: { readonly once?: boolean },
  ): void;
  removeEventListener(type: "controllerchange", callback: () => void): void;
  register(scriptUrl: string): PromiseLike<ServiceWorkerRegistrationLike>;
}

export interface ServiceWorkerUpdateCoordinator {
  onUpdate(callback: UpdateCallback): () => void;
  register(): Promise<void>;
  skipWaitingAndReload(): Promise<void>;
}

export function createServiceWorkerUpdateCoordinator(
  container: ServiceWorkerContainerLike,
  reload: () => void,
): ServiceWorkerUpdateCoordinator {
  let callbacks: UpdateCallback[] = [];
  let updateAvailable = false;
  let reloadPending = false;
  const observedWorkers = new WeakSet<object>();
  const notifiedWorkers = new WeakSet<object>();

  function notifyUpdate(worker: ServiceWorkerLike): void {
    if (notifiedWorkers.has(worker)) return;
    notifiedWorkers.add(worker);
    updateAvailable = true;
    for (const callback of callbacks) callback();
  }

  function observeInstallingWorker(worker: ServiceWorkerLike | null): void {
    if (!worker || observedWorkers.has(worker)) return;
    observedWorkers.add(worker);

    const inspectState = () => {
      if (worker.state === "installed" && container.controller) {
        notifyUpdate(worker);
      }
    };
    worker.addEventListener("statechange", inspectState);
    inspectState();
  }

  function observeRegistration(registration: ServiceWorkerRegistrationLike): void {
    registration.addEventListener("updatefound", () => {
      observeInstallingWorker(registration.installing);
    });
    observeInstallingWorker(registration.installing);
    if (registration.waiting) notifyUpdate(registration.waiting);
  }

  return {
    onUpdate(callback) {
      callbacks = [...callbacks, callback];
      if (updateAvailable) callback();
      return () => {
        callbacks = callbacks.filter((candidate) => candidate !== callback);
      };
    },

    async register() {
      const registration = await container.register("/sw.js");
      observeRegistration(registration);
    },

    async skipWaitingAndReload() {
      if (!container.controller || reloadPending) return;
      reloadPending = true;
      let reloaded = false;

      const handleControllerChange = () => {
        if (reloaded) return;
        reloaded = true;
        container.removeEventListener("controllerchange", handleControllerChange);
        reload();
      };
      const cancelPendingReload = () => {
        if (reloaded) return;
        container.removeEventListener("controllerchange", handleControllerChange);
        reloadPending = false;
      };

      // Install the one-shot listener before messaging the waiting worker so a
      // synchronous controllerchange cannot race past us.
      container.addEventListener(
        "controllerchange",
        handleControllerChange,
        { once: true },
      );

      try {
        const registration = await container.ready;
        if (!registration.waiting) {
          cancelPendingReload();
          return;
        }
        registration.waiting.postMessage({ type: "SKIP_WAITING" });
      } catch {
        cancelPendingReload();
      }
    },
  };
}

let browserCoordinator: ServiceWorkerUpdateCoordinator | null = null;

function getBrowserCoordinator(): ServiceWorkerUpdateCoordinator | null {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }
  if (!browserCoordinator) {
    browserCoordinator = createServiceWorkerUpdateCoordinator(
      navigator.serviceWorker as unknown as ServiceWorkerContainerLike,
      () => window.location.reload(),
    );
  }
  return browserCoordinator;
}

export function onSwUpdate(callback: UpdateCallback): () => void {
  return getBrowserCoordinator()?.onUpdate(callback) ?? (() => undefined);
}

export function registerServiceWorker(): void {
  void getBrowserCoordinator()?.register().catch(() => {
    // Registration failure does not prevent the online application from running.
  });
}

export function skipWaitingAndReload(): void {
  void getBrowserCoordinator()?.skipWaitingAndReload();
}
