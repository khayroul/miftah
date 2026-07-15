import { afterEach, describe, expect, it, vi } from "vitest";
import {
  TasmiStreamClient,
  type TasmiStreamSocket,
} from "./tasmi-stream-client";

class FakeSocket implements TasmiStreamSocket {
  readyState = 0;
  bufferedAmount = 0;
  binaryType = "";
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: ((event: { code?: number }) => void) | null = null;
  sent: Array<string | ArrayBuffer> = [];

  send(data: string | ArrayBuffer): void {
    this.sent = [...this.sent, data];
  }

  close(code?: number): void {
    this.readyState = 3;
    this.onclose?.({ code });
  }

  open(): void {
    this.readyState = 1;
    this.onopen?.();
  }

  message(payload: unknown): void {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }
}

function ticketFetcher(): typeof fetch {
  return vi.fn(async () => new Response(JSON.stringify({
    wsUrl: "wss://tasmi.example/ws/transcribe",
    ticket: "t".repeat(43),
    expiresAt: Date.now() + 60_000,
    protocol: "tasmi-stream-v1",
  }), { status: 200 })) as typeof fetch;
}

function readyMessage() {
  return { type: "ready", protocol: "tasmi-stream-v1", sample_rate: 16_000 };
}

function finalMessage(
  utteranceId: number,
  revision = 1,
  normalizedText = "بسم الله",
) {
  return {
    type: "final",
    utterance_id: utteranceId,
    revision,
    normalized_text: normalizedText,
    audio_ms: 900,
    inference_ms: 240,
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("TasmiStreamClient", () => {
  it("calls the default browser fetch without rebinding its receiver", async () => {
    const socket = new FakeSocket();
    const browserFetch = vi.fn(function (this: unknown) {
      if (this !== undefined) {
        throw new TypeError("Illegal invocation");
      }
      return Promise.resolve(new Response(JSON.stringify({
        wsUrl: "wss://tasmi.example/ws/transcribe",
        ticket: "t".repeat(43),
        expiresAt: Date.now() + 60_000,
        protocol: "tasmi-stream-v1",
      }), { status: 200 }));
    }) as unknown as typeof fetch;
    vi.stubGlobal("fetch", browserFetch);
    const client = new TasmiStreamClient({
      createSocket: () => socket,
      onHypothesis: vi.fn(),
      onUnavailable: vi.fn(),
    });

    const connected = client.connect();
    await vi.waitFor(() => expect(socket.onopen).toBeTypeOf("function"));
    socket.open();
    socket.message(readyMessage());

    await expect(connected).resolves.toBe(true);
    expect(browserFetch).toHaveBeenCalledOnce();
    client.close();
  });

  it("authenticates, batches PCM frames, and emits one final hypothesis", async () => {
    const socket = new FakeSocket();
    const hypotheses = vi.fn();
    const client = new TasmiStreamClient({
      fetcher: ticketFetcher(),
      createSocket: () => socket,
      onHypothesis: hypotheses,
      onUnavailable: vi.fn(),
    });

    const connected = client.connect();
    await vi.waitFor(() => expect(socket.onopen).toBeTypeOf("function"));
    socket.open();
    socket.message(readyMessage());
    await expect(connected).resolves.toBe(true);

    const utteranceId = client.startUtterance();
    expect(utteranceId).toBe(1);
    for (let index = 0; index < 5; index++) {
      client.sendAudioFrame(new Float32Array(512).fill(0.25));
    }
    expect(client.endUtterance(1)).toBe(true);
    socket.message(finalMessage(1));
    socket.message(finalMessage(1, 2));

    expect(socket.sent.some(item => item instanceof ArrayBuffer)).toBe(true);
    expect(hypotheses).toHaveBeenCalledOnce();
    expect(hypotheses).toHaveBeenCalledWith(expect.objectContaining({ type: "final" }));
  });

  it("lets the server judge ticket expiry instead of trusting the phone clock", async () => {
    const socket = new FakeSocket();
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      wsUrl: "wss://tasmi.example/ws/transcribe",
      ticket: "t".repeat(43),
      // Deliberately behind the browser clock; the VPS still validates the
      // single-use ticket when the auth message arrives.
      expiresAt: 1,
      protocol: "tasmi-stream-v1",
    }), { status: 200 })) as typeof fetch;
    const client = new TasmiStreamClient({
      fetcher,
      createSocket: () => socket,
      onHypothesis: vi.fn(),
      onUnavailable: vi.fn(),
    });

    const connected = client.connect();
    await vi.waitFor(() => expect(socket.onopen).toBeTypeOf("function"));
    socket.open();
    socket.message(readyMessage());

    await expect(connected).resolves.toBe(true);
    client.close();
  });

  it("ignores stale partial revisions", async () => {
    const socket = new FakeSocket();
    const hypotheses = vi.fn();
    const client = new TasmiStreamClient({
      fetcher: ticketFetcher(),
      createSocket: () => socket,
      onHypothesis: hypotheses,
      onUnavailable: vi.fn(),
    });
    const connected = client.connect();
    await vi.waitFor(() => expect(socket.onopen).toBeTypeOf("function"));
    socket.open();
    socket.message(readyMessage());
    await connected;

    expect(client.startUtterance()).toBe(1);
    socket.message({ ...finalMessage(1, 2), type: "partial" });
    socket.message({ ...finalMessage(1, 1), type: "partial" });

    expect(hypotheses).toHaveBeenCalledOnce();
  });

  it("reports pending utterances when a final result times out", async () => {
    vi.useFakeTimers();
    const socket = new FakeSocket();
    const unavailable = vi.fn();
    const client = new TasmiStreamClient({
      fetcher: ticketFetcher(),
      createSocket: () => socket,
      finalTimeoutMs: 1_000,
      onHypothesis: vi.fn(),
      onUnavailable: unavailable,
    });
    const connected = client.connect();
    await vi.advanceTimersByTimeAsync(0);
    socket.open();
    socket.message(readyMessage());
    await connected;

    expect(client.startUtterance()).toBe(1);
    expect(client.endUtterance(1)).toBe(true);
    await vi.advanceTimersByTimeAsync(1_000);

    expect(unavailable).toHaveBeenCalledWith("final-timeout", [1]);
    socket.message(finalMessage(1));
    expect(client.isReady).toBe(false);
  });

  it("forces whole-WAV fallback instead of grading lossy backpressured audio", async () => {
    const socket = new FakeSocket();
    socket.bufferedAmount = 100;
    const metric = vi.fn();
    const unavailable = vi.fn();
    const client = new TasmiStreamClient({
      fetcher: ticketFetcher(),
      createSocket: () => socket,
      packetFrameCount: 1,
      maxBufferedBytes: 10,
      onHypothesis: vi.fn(),
      onUnavailable: unavailable,
      onMetric: metric,
    });
    const connected = client.connect();
    await vi.waitFor(() => expect(socket.onopen).toBeTypeOf("function"));
    socket.open();
    socket.message(readyMessage());
    await connected;

    expect(client.sendAudioFrame(new Float32Array(512))).toBe(false);
    expect(metric).toHaveBeenCalledWith({ type: "audio-dropped" });
    expect(unavailable).toHaveBeenCalledWith("audio-backpressure", []);
    expect(client.isReady).toBe(false);
  });

  it("ignores a late socket final after timeout handed the utterance to fallback", async () => {
    vi.useFakeTimers();
    const socket = new FakeSocket();
    const hypotheses = vi.fn();
    const client = new TasmiStreamClient({
      fetcher: ticketFetcher(),
      createSocket: () => socket,
      finalTimeoutMs: 1_000,
      onHypothesis: hypotheses,
      onUnavailable: vi.fn(),
    });
    const connected = client.connect();
    await vi.advanceTimersByTimeAsync(0);
    socket.open();
    socket.message(readyMessage());
    await connected;

    expect(client.startUtterance()).toBe(1);
    expect(client.endUtterance(1)).toBe(true);
    await vi.advanceTimersByTimeAsync(1_000);
    socket.message(finalMessage(1));

    expect(hypotheses).not.toHaveBeenCalled();
  });

  it("does not open an orphan socket when closed while its ticket is pending", async () => {
    let resolveTicket: ((response: Response) => void) | undefined;
    const fetcher = vi.fn(() => new Promise<Response>(resolve => {
      resolveTicket = resolve;
    })) as unknown as typeof fetch;
    const createSocket = vi.fn(() => new FakeSocket());
    const client = new TasmiStreamClient({
      fetcher,
      createSocket,
      onHypothesis: vi.fn(),
      onUnavailable: vi.fn(),
    });

    const connected = client.connect();
    client.close();
    resolveTicket?.(new Response(JSON.stringify({
      wsUrl: "wss://tasmi.example/ws/transcribe",
      ticket: "t".repeat(43),
      expiresAt: Date.now() + 60_000,
      protocol: "tasmi-stream-v1",
    }), { status: 200 }));

    await expect(connected).resolves.toBe(false);
    expect(createSocket).not.toHaveBeenCalled();
  });

  it("falls back when the stream ticket request itself hangs", async () => {
    vi.useFakeTimers();
    const unavailable = vi.fn();
    const createSocket = vi.fn(() => new FakeSocket());
    const client = new TasmiStreamClient({
      fetcher: vi.fn(() => new Promise<Response>(() => undefined)) as unknown as typeof fetch,
      createSocket,
      ticketTimeoutMs: 1_000,
      onHypothesis: vi.fn(),
      onUnavailable: unavailable,
    });

    const connected = client.connect();
    await vi.advanceTimersByTimeAsync(1_000);

    await expect(connected).resolves.toBe(false);
    expect(unavailable).toHaveBeenCalledWith("ticket-timeout", []);
    expect(createSocket).not.toHaveBeenCalled();
  });

  it("commits reversed final arrivals in utterance order", async () => {
    const socket = new FakeSocket();
    const hypotheses = vi.fn();
    const client = new TasmiStreamClient({
      fetcher: ticketFetcher(),
      createSocket: () => socket,
      onHypothesis: hypotheses,
      onUnavailable: vi.fn(),
    });
    const connected = client.connect();
    await vi.waitFor(() => expect(socket.onopen).toBeTypeOf("function"));
    socket.open();
    socket.message(readyMessage());
    await connected;

    expect(client.startUtterance()).toBe(1);
    expect(client.endUtterance(1)).toBe(true);
    expect(client.startUtterance()).toBe(2);
    expect(client.endUtterance(2)).toBe(true);
    socket.message(finalMessage(2, 1, "الرحمن الرحيم"));
    expect(hypotheses).not.toHaveBeenCalled();

    socket.message(finalMessage(1, 1, "بسم الله"));

    expect(hypotheses.mock.calls.map(([message]) => message.utterance_id))
      .toEqual([1, 2]);
  });

  it("defers a future utterance preview until the earlier final commits", async () => {
    const socket = new FakeSocket();
    const hypotheses = vi.fn();
    const client = new TasmiStreamClient({
      fetcher: ticketFetcher(),
      createSocket: () => socket,
      onHypothesis: hypotheses,
      onUnavailable: vi.fn(),
    });
    const connected = client.connect();
    await vi.waitFor(() => expect(socket.onopen).toBeTypeOf("function"));
    socket.open();
    socket.message(readyMessage());
    await connected;

    expect(client.startUtterance()).toBe(1);
    expect(client.endUtterance(1)).toBe(true);
    expect(client.startUtterance()).toBe(2);
    socket.message({ ...finalMessage(2), type: "partial" });
    expect(hypotheses).not.toHaveBeenCalled();

    socket.message(finalMessage(1));

    expect(hypotheses.mock.calls.map(([message]) => [
      message.type,
      message.utterance_id,
    ])).toEqual([["final", 1], ["partial", 2]]);
  });

  it("reports speech-end-to-final latency separately from model inference", async () => {
    const socket = new FakeSocket();
    const metric = vi.fn();
    let now = 1_000;
    const client = new TasmiStreamClient({
      fetcher: ticketFetcher(),
      createSocket: () => socket,
      now: () => now,
      onHypothesis: vi.fn(),
      onUnavailable: vi.fn(),
      onMetric: metric,
    });
    const connected = client.connect();
    await vi.waitFor(() => expect(socket.onopen).toBeTypeOf("function"));
    socket.open();
    socket.message(readyMessage());
    await connected;

    expect(client.startUtterance()).toBe(1);
    expect(client.endUtterance(1)).toBe(true);
    now = 1_420;
    socket.message(finalMessage(1));

    expect(metric).toHaveBeenCalledWith(expect.objectContaining({
      type: "final",
      inferenceMs: 240,
      endToEndMs: 420,
    }));
  });
});
