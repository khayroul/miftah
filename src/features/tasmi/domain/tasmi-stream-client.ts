import {
  parseTasmiStreamServerMessage,
  StreamTicketSchema,
  type TasmiStreamHypothesis,
} from "./tasmi-stream-protocol";

const OPEN_STATE = 1;
const DEFAULT_PACKET_FRAME_COUNT = 5; // 5 × 32 ms VAD frames = 160 ms
const DEFAULT_MAX_BUFFERED_BYTES = 32 * 1024; // roughly one second of PCM16

interface StreamSocketMessageEvent {
  data: unknown;
}

interface StreamSocketCloseEvent {
  code?: number;
}

export interface TasmiStreamSocket {
  readonly readyState: number;
  readonly bufferedAmount: number;
  binaryType: string;
  onopen: (() => void) | null;
  onmessage: ((event: StreamSocketMessageEvent) => void) | null;
  onerror: (() => void) | null;
  onclose: ((event: StreamSocketCloseEvent) => void) | null;
  send(data: string | ArrayBuffer): void;
  close(code?: number, reason?: string): void;
}

export interface TasmiStreamMetric {
  type: "partial" | "final" | "audio-dropped";
  utteranceId?: number;
  audioMs?: number;
  inferenceMs?: number;
  /** Time from sending speech_end until the final result reaches the browser. */
  endToEndMs?: number;
}

export interface TasmiStreamClientConfig {
  ticketEndpoint?: string;
  fetcher?: typeof fetch;
  createSocket?: (url: string) => TasmiStreamSocket;
  ticketTimeoutMs?: number;
  connectTimeoutMs?: number;
  finalTimeoutMs?: number;
  packetFrameCount?: number;
  maxBufferedBytes?: number;
  now?: () => number;
  onHypothesis: (hypothesis: TasmiStreamHypothesis) => void;
  onUnavailable: (reason: string, pendingUtteranceIds: number[]) => void;
  onMetric?: (metric: TasmiStreamMetric) => void;
}

export class TasmiStreamClient {
  private readonly config: Required<Pick<
    TasmiStreamClientConfig,
    "ticketEndpoint" | "fetcher" | "createSocket" | "ticketTimeoutMs" | "connectTimeoutMs" |
    "finalTimeoutMs" | "packetFrameCount" | "maxBufferedBytes" | "now"
  >> & Pick<TasmiStreamClientConfig, "onHypothesis" | "onUnavailable" | "onMetric">;
  private socket: TasmiStreamSocket | null = null;
  private ready = false;
  private closedIntentionally = false;
  private unavailableReported = false;
  private nextUtteranceId = 1;
  private pendingFrames: Float32Array[] = [];
  private pendingUtterances: Set<number> = new Set();
  private finalTimers: Map<number, ReturnType<typeof setTimeout>> = new Map();
  private highestRevisions: Map<number, number> = new Map();
  private finalizedUtterances: Set<number> = new Set();
  private utteranceEndTimes: Map<number, number> = new Map();
  private uncommittedUtteranceOrder: number[] = [];
  private bufferedFinals: Map<number, TasmiStreamHypothesis> = new Map();
  private bufferedFinalEndToEndMs: Map<number, number> = new Map();
  private deferredPartials: Map<number, TasmiStreamHypothesis> = new Map();
  private connectionGeneration = 0;
  private ticketController: AbortController | null = null;

  constructor(config: TasmiStreamClientConfig) {
    this.config = {
      ticketEndpoint: config.ticketEndpoint ?? "/api/tasmi/stream-session",
      // Never store window.fetch directly and invoke it through the config
      // object: browsers brand-check its receiver and throw "Illegal
      // invocation" before a request is sent. Keep the native call lexical.
      fetcher: config.fetcher ?? ((input, init) => fetch(input, init)),
      createSocket: config.createSocket ?? ((url: string) => new WebSocket(url) as TasmiStreamSocket),
      ticketTimeoutMs: config.ticketTimeoutMs ?? 4_000,
      connectTimeoutMs: config.connectTimeoutMs ?? 4_000,
      finalTimeoutMs: config.finalTimeoutMs ?? 8_000,
      packetFrameCount: config.packetFrameCount ?? DEFAULT_PACKET_FRAME_COUNT,
      maxBufferedBytes: config.maxBufferedBytes ?? DEFAULT_MAX_BUFFERED_BYTES,
      now: config.now ?? (() => Date.now()),
      onHypothesis: config.onHypothesis,
      onUnavailable: config.onUnavailable,
      onMetric: config.onMetric,
    };
  }

  get isReady(): boolean {
    return this.ready && this.socket?.readyState === OPEN_STATE;
  }

  async connect(): Promise<boolean> {
    const generation = this.connectionGeneration + 1;
    this.connectionGeneration = generation;
    this.ticketController?.abort();
    this.ticketController = null;
    const previousSocket = this.socket;
    this.socket = null;
    this.ready = false;
    if (previousSocket) previousSocket.close(1000, "stream-replaced");
    this.pendingFrames = [];
    this.pendingUtterances = new Set();
    this.utteranceEndTimes = new Map();
    this.clearFinalTimers();
    this.clearRecognitionBuffers();

    this.closedIntentionally = false;
    this.unavailableReported = false;
    const ticketController = new AbortController();
    this.ticketController = ticketController;
    let ticketTimedOut = false;
    let ticketTimer: ReturnType<typeof setTimeout> | null = null;
    try {
      const ticketRequest = async () => {
        const response = await this.config.fetcher(this.config.ticketEndpoint, {
          method: "POST",
          cache: "no-store",
          signal: ticketController.signal,
        });
        const rawTicket: unknown = await response.json().catch(() => null);
        return { response, rawTicket };
      };
      const ticketTimeout = new Promise<never>((_resolve, reject) => {
        ticketTimer = setTimeout(() => {
          ticketTimedOut = true;
          ticketController.abort();
          reject(new Error("ticket-timeout"));
        }, this.config.ticketTimeoutMs);
      });
      const { response, rawTicket } = await Promise.race([
        ticketRequest(),
        ticketTimeout,
      ]);
      if (ticketTimer) clearTimeout(ticketTimer);
      ticketTimer = null;
      if (!this.isCurrentConnection(generation) || ticketController.signal.aborted) {
        return false;
      }
      const ticket = StreamTicketSchema.safeParse(rawTicket);
      // The server is authoritative for ticket expiry. Rejecting against the
      // phone's wall clock makes valid tickets fail on clock-skewed devices.
      if (!response.ok || !ticket.success) {
        this.reportUnavailable("ticket-unavailable");
        return false;
      }

      const socket = this.config.createSocket(ticket.data.wsUrl);
      if (!this.isCurrentConnection(generation)) {
        socket.close(1000, "stale-connection");
        return false;
      }
      socket.binaryType = "arraybuffer";
      this.socket = socket;

      return await new Promise<boolean>((resolve) => {
        let settled = false;
        const settle = (value: boolean) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          resolve(value);
        };
        const timeout = setTimeout(() => {
          if (!this.isCurrentSocket(generation, socket)) {
            settle(false);
            return;
          }
          this.reportUnavailable("connect-timeout");
          settle(false);
        }, this.config.connectTimeoutMs);

        socket.onopen = () => {
          if (!this.isCurrentSocket(generation, socket)) {
            settle(false);
            return;
          }
          try {
            socket.send(JSON.stringify({ type: "auth", ticket: ticket.data.ticket }));
          } catch {
            this.reportUnavailable("auth-send-failed");
            settle(false);
          }
        };
        socket.onmessage = event => {
          if (!this.isCurrentSocket(generation, socket)) return;
          const message = parseTasmiStreamServerMessage(event.data);
          if (!message) return;
          if (message.type === "ready") {
            this.ready = true;
            settle(true);
            return;
          }
          this.handleServerMessage(message);
        };
        socket.onerror = () => {
          if (!this.isCurrentSocket(generation, socket)) {
            settle(false);
            return;
          }
          this.reportUnavailable("socket-error");
          settle(false);
        };
        socket.onclose = () => {
          if (!this.isCurrentSocket(generation, socket)) {
            settle(false);
            return;
          }
          this.ready = false;
          if (!this.closedIntentionally) this.reportUnavailable("socket-closed");
          settle(false);
        };
      });
    } catch {
      if (
        !this.isCurrentConnection(generation) ||
        this.closedIntentionally
      ) return false;
      if (ticketTimedOut) {
        this.reportUnavailable("ticket-timeout");
        return false;
      }
      if (ticketController.signal.aborted) return false;
      this.reportUnavailable("ticket-unreachable");
      return false;
    } finally {
      if (ticketTimer) clearTimeout(ticketTimer);
      if (this.ticketController === ticketController) {
        this.ticketController = null;
      }
    }
  }

  startUtterance(): number | null {
    if (!this.isReady) return null;
    const utteranceId = this.nextUtteranceId;
    this.nextUtteranceId += 1;
    if (!this.sendControl({ type: "speech_start", utterance_id: utteranceId })) {
      return null;
    }
    this.uncommittedUtteranceOrder = [
      ...this.uncommittedUtteranceOrder,
      utteranceId,
    ];
    return utteranceId;
  }

  sendAudioFrame(frame: Float32Array): boolean {
    if (!this.isReady) return false;
    this.pendingFrames = [...this.pendingFrames, frame.slice()];
    if (this.pendingFrames.length < this.config.packetFrameCount) return true;
    return this.flushAudioFrames();
  }

  endUtterance(utteranceId: number): boolean {
    if (!this.isReady) return false;
    this.flushAudioFrames();
    if (!this.isReady) return false;

    this.pendingUtterances = new Set([...this.pendingUtterances, utteranceId]);
    this.utteranceEndTimes = new Map(this.utteranceEndTimes).set(
      utteranceId,
      this.config.now(),
    );
    const timer = setTimeout(() => {
      this.reportUnavailable("final-timeout");
    }, this.config.finalTimeoutMs);
    this.finalTimers = new Map(this.finalTimers).set(utteranceId, timer);
    if (this.sendControl({ type: "speech_end", utterance_id: utteranceId })) {
      return true;
    }

    clearTimeout(timer);
    this.pendingUtterances = new Set(
      [...this.pendingUtterances].filter(id => id !== utteranceId),
    );
    this.utteranceEndTimes = new Map(
      [...this.utteranceEndTimes].filter(([id]) => id !== utteranceId),
    );
    this.finalTimers = new Map(
      [...this.finalTimers].filter(([id]) => id !== utteranceId),
    );
    return false;
  }

  pause(): void {
    this.pendingFrames = [];
    this.sendControl({ type: "pause" });
  }

  resume(): void {
    this.sendControl({ type: "resume" });
  }

  close(): void {
    this.closedIntentionally = true;
    this.connectionGeneration += 1;
    this.ticketController?.abort();
    this.ticketController = null;
    this.ready = false;
    this.pendingFrames = [];
    this.pendingUtterances = new Set();
    this.utteranceEndTimes = new Map();
    this.clearRecognitionBuffers();
    this.clearFinalTimers();
    const socket = this.socket;
    this.socket = null;
    if (!socket) return;
    if (socket.readyState === OPEN_STATE) {
      try {
        socket.send(JSON.stringify({ type: "stop" }));
      } catch {
        // Closing is best-effort; the socket is closed immediately below.
      }
    }
    socket.close(1000, "session-ended");
  }

  private handleServerMessage(
    message: Exclude<ReturnType<typeof parseTasmiStreamServerMessage>, null>,
  ): void {
    if (message.type === "error") {
      this.reportUnavailable(message.code);
      return;
    }
    if (message.type !== "partial" && message.type !== "final") return;

    const previousRevision = this.highestRevisions.get(message.utterance_id) ?? 0;
    if (
      message.revision <= previousRevision ||
      this.finalizedUtterances.has(message.utterance_id) ||
      (message.type === "partial" && this.bufferedFinals.has(message.utterance_id))
    ) return;
    this.highestRevisions = new Map(this.highestRevisions).set(
      message.utterance_id,
      message.revision,
    );

    if (message.type === "partial") {
      if (this.uncommittedUtteranceOrder[0] === message.utterance_id) {
        this.emitHypothesis(message);
      } else {
        // The matcher cursor still belongs to an earlier utterance. Retain only
        // the newest preview and reveal it after that earlier final commits.
        this.deferredPartials = new Map(this.deferredPartials).set(
          message.utterance_id,
          message,
        );
      }
      return;
    }

    if (!this.pendingUtterances.has(message.utterance_id)) return;
    const timer = this.finalTimers.get(message.utterance_id);
    if (timer) clearTimeout(timer);
    this.finalTimers = new Map(
      [...this.finalTimers].filter(([id]) => id !== message.utterance_id),
    );
    const endedAt = this.utteranceEndTimes.get(message.utterance_id);
    if (endedAt != null) {
      this.bufferedFinalEndToEndMs = new Map(
        this.bufferedFinalEndToEndMs,
      ).set(message.utterance_id, Math.max(0, this.config.now() - endedAt));
    }
    this.bufferedFinals = new Map(this.bufferedFinals).set(
      message.utterance_id,
      message,
    );
    this.flushOrderedFinals();
  }

  private flushAudioFrames(): boolean {
    const socket = this.socket;
    const frames = this.pendingFrames;
    this.pendingFrames = [];
    if (!socket || socket.readyState !== OPEN_STATE || frames.length === 0) return false;
    if (socket.bufferedAmount > this.config.maxBufferedBytes) {
      this.config.onMetric?.({ type: "audio-dropped" });
      // A lossy stream must never be graded as if it heard the whole ayah.
      // Closing here routes the complete VAD WAV through the HTTP fallback.
      this.reportUnavailable("audio-backpressure");
      return false;
    }

    const sampleCount = frames.reduce((total, frame) => total + frame.length, 0);
    const pcm = new Int16Array(sampleCount);
    let offset = 0;
    for (const frame of frames) {
      for (const sample of frame) {
        const clamped = Math.max(-1, Math.min(1, sample));
        pcm[offset] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
        offset += 1;
      }
    }

    try {
      socket.send(pcm.buffer);
      return true;
    } catch {
      this.reportUnavailable("audio-send-failed");
      return false;
    }
  }

  private sendControl(payload: Record<string, string | number>): boolean {
    const socket = this.socket;
    if (!socket || socket.readyState !== OPEN_STATE) return false;
    try {
      socket.send(JSON.stringify(payload));
      return true;
    } catch {
      this.reportUnavailable("control-send-failed");
      return false;
    }
  }

  private reportUnavailable(reason: string): void {
    if (this.unavailableReported || this.closedIntentionally) return;
    this.unavailableReported = true;
    this.ready = false;
    this.connectionGeneration += 1;
    this.ticketController?.abort();
    this.ticketController = null;
    const pending = [...this.pendingUtterances];
    this.pendingUtterances = new Set();
    this.pendingFrames = [];
    this.utteranceEndTimes = new Map();
    this.clearRecognitionBuffers();
    this.clearFinalTimers();
    const socket = this.socket;
    this.socket = null;
    if (socket) socket.close(1011, "stream-unavailable");
    this.config.onUnavailable(reason, pending);
  }

  private clearFinalTimers(): void {
    for (const timer of this.finalTimers.values()) clearTimeout(timer);
    this.finalTimers = new Map();
  }

  private flushOrderedFinals(): void {
    while (this.isReady) {
      const nextUtteranceId = this.uncommittedUtteranceOrder[0];
      if (nextUtteranceId == null) break;
      const final = this.bufferedFinals.get(nextUtteranceId);
      if (!final) break;

      const endToEndMs = this.bufferedFinalEndToEndMs.get(nextUtteranceId);
      this.bufferedFinals = new Map(
        [...this.bufferedFinals].filter(([id]) => id !== nextUtteranceId),
      );
      this.bufferedFinalEndToEndMs = new Map(
        [...this.bufferedFinalEndToEndMs]
          .filter(([id]) => id !== nextUtteranceId),
      );
      this.deferredPartials = new Map(
        [...this.deferredPartials].filter(([id]) => id !== nextUtteranceId),
      );
      this.uncommittedUtteranceOrder = this.uncommittedUtteranceOrder.slice(1);
      this.finalizedUtterances = new Set([
        ...this.finalizedUtterances,
        nextUtteranceId,
      ]);
      this.pendingUtterances = new Set(
        [...this.pendingUtterances].filter(id => id !== nextUtteranceId),
      );
      this.utteranceEndTimes = new Map(
        [...this.utteranceEndTimes].filter(([id]) => id !== nextUtteranceId),
      );
      this.emitHypothesis(final, endToEndMs);
    }

    if (!this.isReady) return;
    const nextUtteranceId = this.uncommittedUtteranceOrder[0];
    if (nextUtteranceId == null) return;
    const deferredPartial = this.deferredPartials.get(nextUtteranceId);
    if (!deferredPartial) return;
    this.deferredPartials = new Map(
      [...this.deferredPartials].filter(([id]) => id !== nextUtteranceId),
    );
    this.emitHypothesis(deferredPartial);
  }

  private emitHypothesis(
    hypothesis: TasmiStreamHypothesis,
    endToEndMs?: number,
  ): void {
    this.config.onMetric?.({
      type: hypothesis.type,
      utteranceId: hypothesis.utterance_id,
      audioMs: hypothesis.audio_ms,
      inferenceMs: hypothesis.inference_ms,
      endToEndMs,
    });
    this.config.onHypothesis(hypothesis);
  }

  private clearRecognitionBuffers(): void {
    this.uncommittedUtteranceOrder = [];
    this.bufferedFinals = new Map();
    this.bufferedFinalEndToEndMs = new Map();
    this.deferredPartials = new Map();
  }

  private isCurrentConnection(generation: number): boolean {
    return generation === this.connectionGeneration && !this.closedIntentionally;
  }

  private isCurrentSocket(
    generation: number,
    socket: TasmiStreamSocket,
  ): boolean {
    return this.isCurrentConnection(generation) && this.socket === socket;
  }
}
