import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createServiceWorkerUpdateCoordinator,
  type ServiceWorkerContainerLike,
  type ServiceWorkerLike,
  type ServiceWorkerRegistrationLike,
} from "./swRegistration";

class FakeWorker implements ServiceWorkerLike {
  state = "installing";
  readonly messages: unknown[] = [];
  private readonly listeners: Array<() => void> = [];
  onPostMessage?: () => void;

  addEventListener(_type: "statechange", callback: () => void): void {
    this.listeners.push(callback);
  }

  postMessage(message: unknown): void {
    this.messages.push(message);
    this.onPostMessage?.();
  }

  transitionTo(state: string): void {
    this.state = state;
    for (const listener of this.listeners) listener();
  }
}

class FakeRegistration implements ServiceWorkerRegistrationLike {
  installing: FakeWorker | null = null;
  waiting: FakeWorker | null = null;
  private readonly updateListeners: Array<() => void> = [];

  addEventListener(_type: "updatefound", callback: () => void): void {
    this.updateListeners.push(callback);
  }

  findUpdate(worker: FakeWorker): void {
    this.installing = worker;
    for (const listener of this.updateListeners) listener();
  }
}

class FakeContainer implements ServiceWorkerContainerLike {
  controller: unknown | null = {};
  readonly eventOrder: string[] = [];
  readonly registration: FakeRegistration;
  readonly ready: PromiseLike<ServiceWorkerRegistrationLike>;
  private readonly controllerListeners = new Set<() => void>();

  constructor(registration = new FakeRegistration()) {
    this.registration = registration;
    this.ready = Promise.resolve(registration);
  }

  register(scriptUrl: string): PromiseLike<ServiceWorkerRegistrationLike> {
    assert.equal(scriptUrl, "/sw.js");
    return Promise.resolve(this.registration);
  }

  addEventListener(
    _type: "controllerchange",
    callback: () => void,
    options?: { readonly once?: boolean },
  ): void {
    assert.deepEqual(options, { once: true });
    this.eventOrder.push("listen");
    this.controllerListeners.add(callback);
  }

  removeEventListener(_type: "controllerchange", callback: () => void): void {
    this.controllerListeners.delete(callback);
  }

  dispatchControllerChange(): void {
    for (const listener of [...this.controllerListeners]) listener();
  }
}

describe("service-worker update coordination", () => {
  it("detects an already-waiting worker and replays state to a late subscriber", async () => {
    const registration = new FakeRegistration();
    registration.waiting = new FakeWorker();
    const coordinator = createServiceWorkerUpdateCoordinator(
      new FakeContainer(registration),
      () => undefined,
    );
    let earlyNotifications = 0;
    coordinator.onUpdate(() => {
      earlyNotifications += 1;
    });

    await coordinator.register();
    let lateNotifications = 0;
    coordinator.onUpdate(() => {
      lateNotifications += 1;
    });

    assert.equal(earlyNotifications, 1);
    assert.equal(lateNotifications, 1);
  });

  it("observes updatefound races and notifies once when installation completes", async () => {
    const container = new FakeContainer();
    const coordinator = createServiceWorkerUpdateCoordinator(container, () => undefined);
    let notifications = 0;
    coordinator.onUpdate(() => {
      notifications += 1;
    });
    await coordinator.register();

    const worker = new FakeWorker();
    container.registration.findUpdate(worker);
    worker.transitionTo("installed");
    worker.transitionTo("installed");

    assert.equal(notifications, 1);
  });

  it("listens before SKIP_WAITING and reloads exactly once across races", async () => {
    const registration = new FakeRegistration();
    const worker = new FakeWorker();
    registration.waiting = worker;
    const container = new FakeContainer(registration);
    let reloads = 0;
    worker.onPostMessage = () => {
      container.eventOrder.push("post");
      container.dispatchControllerChange();
      container.dispatchControllerChange();
    };
    const coordinator = createServiceWorkerUpdateCoordinator(container, () => {
      reloads += 1;
    });

    await Promise.all([
      coordinator.skipWaitingAndReload(),
      coordinator.skipWaitingAndReload(),
    ]);

    assert.deepEqual(container.eventOrder, ["listen", "post"]);
    assert.deepEqual(worker.messages, [{ type: "SKIP_WAITING" }]);
    assert.equal(reloads, 1);
  });

  it("cancels the one-shot reload when no worker is waiting", async () => {
    const container = new FakeContainer();
    let reloads = 0;
    const coordinator = createServiceWorkerUpdateCoordinator(container, () => {
      reloads += 1;
    });

    await coordinator.skipWaitingAndReload();
    container.dispatchControllerChange();

    assert.equal(reloads, 0);
  });
});
