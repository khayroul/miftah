import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  newVad: vi.fn(),
}));

vi.mock("@ricky0123/vad-web", () => ({
  MicVAD: { new: mocks.newVad },
}));

import { TasmiRecorder } from "./tasmi-recorder";

function createRecorder(onError = vi.fn()) {
  return {
    onError,
    recorder: new TasmiRecorder({
      onError,
      onSilenceTimeout: vi.fn(),
      onSpeechEnd: vi.fn(),
      silenceTimeoutSeconds: 6,
    }),
  };
}

describe("TasmiRecorder microphone startup", () => {
  beforeEach(() => {
    mocks.newVad.mockReset();
  });

  it("reports success only after the VAD microphone has actually started", async () => {
    const vad = {
      destroy: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn().mockResolvedValue(undefined),
      start: vi.fn().mockResolvedValue(undefined),
    };
    mocks.newVad.mockResolvedValue(vad);
    const { onError, recorder } = createRecorder();

    await expect(recorder.start()).resolves.toBe(true);

    expect(vad.start).toHaveBeenCalledOnce();
    expect(onError).not.toHaveBeenCalled();
    recorder.stop();
  });

  it("returns false and classifies a rejected microphone permission request", async () => {
    const vad = {
      destroy: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn().mockResolvedValue(undefined),
      start: vi.fn().mockRejectedValue(
        new DOMException("Microphone permission denied", "NotAllowedError"),
      ),
    };
    mocks.newVad.mockResolvedValue(vad);
    const { onError, recorder } = createRecorder();

    await expect(recorder.start()).resolves.toBe(false);

    expect(vad.destroy).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "permission-denied" }),
    );
  });

  it("does not activate a microphone whose start was cancelled while VAD was loading", async () => {
    const vad = {
      destroy: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn().mockResolvedValue(undefined),
      start: vi.fn().mockResolvedValue(undefined),
    };
    let resolveVad: ((value: typeof vad) => void) | undefined;
    mocks.newVad.mockReturnValue(
      new Promise<typeof vad>((resolve) => {
        resolveVad = resolve;
      }),
    );
    const { onError, recorder } = createRecorder();

    const startPromise = recorder.start();
    recorder.stop();
    resolveVad?.(vad);

    await expect(startPromise).resolves.toBe(false);
    expect(vad.start).not.toHaveBeenCalled();
    expect(vad.destroy).toHaveBeenCalledOnce();
    expect(onError).not.toHaveBeenCalled();
  });
});
