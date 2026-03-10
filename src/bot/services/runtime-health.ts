export interface StartupCheck {
  name: string;
  ok: boolean;
  detail: string;
  atIso: string;
}

interface RuntimeState {
  bootedAtMs: number;
  pollingActive: boolean;
  pollingRestartCount: number;
  lastPollingError: string | null;
  lastPollingErrorAtIso: string | null;
  lockPath: string | null;
  lockOwnerPid: number | null;
  startupChecks: StartupCheck[];
}

const MAX_CHECK_HISTORY = 20;

const state: RuntimeState = {
  bootedAtMs: Date.now(),
  pollingActive: false,
  pollingRestartCount: 0,
  lastPollingError: null,
  lastPollingErrorAtIso: null,
  lockPath: null,
  lockOwnerPid: null,
  startupChecks: [],
};

export function setLockInfo(lockPath: string, lockOwnerPid: number): void {
  state.lockPath = lockPath;
  state.lockOwnerPid = lockOwnerPid;
}

export function addStartupCheck(name: string, ok: boolean, detail: string): void {
  state.startupChecks.push({
    name,
    ok,
    detail,
    atIso: new Date().toISOString(),
  });
  if (state.startupChecks.length > MAX_CHECK_HISTORY) {
    state.startupChecks = state.startupChecks.slice(-MAX_CHECK_HISTORY);
  }
}

export function markPollingStarted(): void {
  state.pollingActive = true;
}

export function markPollingError(error: unknown): void {
  state.pollingActive = false;
  state.pollingRestartCount += 1;
  state.lastPollingError = String(error);
  state.lastPollingErrorAtIso = new Date().toISOString();
}

export function markPollingStopped(): void {
  state.pollingActive = false;
}

export function getRuntimeState(): RuntimeState {
  return {
    ...state,
    startupChecks: [...state.startupChecks],
  };
}
