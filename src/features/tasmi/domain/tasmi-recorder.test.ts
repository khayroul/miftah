import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

  it("forwards 16 kHz VAD frames and speech boundaries for streaming", async () => {
    let options: {
      onFrameProcessed: (probabilities: { isSpeech: number }, frame: Float32Array) => void;
      onSpeechStart: () => void;
      onSpeechRealStart: () => void;
    } | undefined;
    const vad = {
      destroy: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn().mockResolvedValue(undefined),
      start: vi.fn().mockImplementation(async () => {
        options?.onFrameProcessed({ isSpeech: 0.9 }, new Float32Array([0.25]));
        options?.onSpeechStart();
        options?.onSpeechRealStart();
      }),
    };
    mocks.newVad.mockImplementation(async (receivedOptions) => {
      options = receivedOptions;
      return vad;
    });
    const onAudioFrame = vi.fn();
    const onSpeechStart = vi.fn();
    const recorder = new TasmiRecorder({
      onAudioFrame,
      onSpeechStart,
      onError: vi.fn(),
      onSilenceTimeout: vi.fn(),
      onSpeechEnd: vi.fn(),
      silenceTimeoutSeconds: 6,
    });

    await expect(recorder.start()).resolves.toBe(true);

    expect(onAudioFrame).toHaveBeenCalledWith(new Float32Array([0.25]));
    expect(onSpeechStart).toHaveBeenCalledOnce();
    recorder.stop();
  });

  it("does not open a streaming utterance for a VAD misfire", async () => {
    let options: {
      onSpeechStart: () => void;
      onSpeechRealStart: () => void;
      onVADMisfire: () => void;
    } | undefined;
    const vad = {
      destroy: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn().mockResolvedValue(undefined),
      start: vi.fn().mockResolvedValue(undefined),
    };
    mocks.newVad.mockImplementation(async receivedOptions => {
      options = receivedOptions;
      return vad;
    });
    const onSpeechStart = vi.fn();
    const recorder = new TasmiRecorder({
      onSpeechStart,
      onError: vi.fn(),
      onSilenceTimeout: vi.fn(),
      onSpeechEnd: vi.fn(),
      silenceTimeoutSeconds: 4,
    });

    await recorder.start();
    options?.onSpeechStart();
    options?.onVADMisfire();

    expect(onSpeechStart).not.toHaveBeenCalled();
    recorder.stop();
  });
});

describe("TasmiRecorder adaptive teacher silence", () => {
  afterEach(() => vi.useRealTimers());

  it("nudges before spoken-help timeout", async () => {
    vi.useFakeTimers();
    const vad = {
      destroy: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn().mockResolvedValue(undefined),
      start: vi.fn().mockResolvedValue(undefined),
    };
    mocks.newVad.mockResolvedValue(vad);
    const onSilenceNudge = vi.fn();
    const onSilenceTimeout = vi.fn();
    const recorder = new TasmiRecorder({
      onSilenceNudge,
      onSilenceTimeout,
      onError: vi.fn(),
      onSpeechEnd: vi.fn(),
      silenceNudgeSeconds: 2.5,
      silenceTimeoutSeconds: 4,
    });

    await recorder.start();
    await vi.advanceTimersByTimeAsync(2_500);
    expect(onSilenceNudge).toHaveBeenCalledOnce();
    expect(onSilenceTimeout).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1_500);
    expect(onSilenceTimeout).toHaveBeenCalledOnce();
    recorder.stop();
  });

  it("never nudges or plays talqin during a long active recitation", async () => {
    vi.useFakeTimers();
    let options: {
      onSpeechStart: () => void;
      onSpeechEnd: (audio: Float32Array) => void;
    } | undefined;
    const vad = {
      destroy: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn().mockResolvedValue(undefined),
      start: vi.fn().mockResolvedValue(undefined),
    };
    mocks.newVad.mockImplementation(async receivedOptions => {
      options = receivedOptions;
      return vad;
    });
    const onSilenceNudge = vi.fn();
    const onSilenceTimeout = vi.fn();
    const recorder = new TasmiRecorder({
      onSilenceNudge,
      onSilenceTimeout,
      onError: vi.fn(),
      onSpeechEnd: vi.fn(),
      silenceNudgeSeconds: 2.5,
      silenceTimeoutSeconds: 4,
    });

    await recorder.start();
    options?.onSpeechStart();
    await vi.advanceTimersByTimeAsync(10_000);

    expect(onSilenceNudge).not.toHaveBeenCalled();
    expect(onSilenceTimeout).not.toHaveBeenCalled();

    options?.onSpeechEnd(new Float32Array(16_000));
    // The VAD callback itself arrives after 700 ms of observed silence.
    await vi.advanceTimersByTimeAsync(1_799);
    expect(onSilenceNudge).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(onSilenceNudge).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(1_499);
    expect(onSilenceTimeout).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(onSilenceTimeout).toHaveBeenCalledOnce();
    recorder.stop();
  });
});
