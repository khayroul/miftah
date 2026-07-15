/**
 * Tasmi' session manager.
 * Orchestrates the full tasmi' flow: recording → transcription → matching → talqin.
 */

import { SequenceMatcher, MatchResult } from './sequence-matcher';

export interface TasmiConfig {
  /** Server URL for transcription */
  serverUrl: string;
  /** Optional API key for direct server auth */
  apiKey?: string;
  /** Seconds of silence before triggering talqin (default: 6) */
  silenceThresholdSeconds: number;
  /** Number of consecutive errors before triggering talqin (default: 2) */
  errorThresholdCount: number;
  /**
   * Mode B exam/practice toggle (operator vision, clarifier #1).
   * false = exam mode: mistakes are tracked and scored but NO talqin help is
   * given (traditional examination — the examiner stays silent).
   * Default true (practice / Mode A behaviour).
   */
  talqinEnabled?: boolean;
  /** HTTP fallback timeout. Streaming has its own shorter acknowledgement timer. */
  requestTimeoutMs?: number;
}

export interface TasmiSessionResult {
  /** Total words in the expected text */
  totalWords: number;
  /** Words recited correctly without prompting */
  wordsCorrect: number;
  /** Number of times talqin was triggered */
  talqinCount: number;
  /** Positions where errors occurred */
  errorPositions: number[];
  /** Overall accuracy percentage */
  accuracy: number;
  /** Duration of session in seconds */
  durationSeconds: number;
}

export type TasmiEventType =
  | 'ready'           // Server warmed up, ready to listen
  | 'listening'       // Mic is active, waiting for speech
  | 'processing'      // Audio chunk sent to server, waiting for response
  | 'hypothesis'      // Tentative streaming result — display only, never scored
  | 'match'           // Chunk matched successfully
  | 'error'           // Recitation error detected (a genuine mismatch)
  | 'no-speech'       // Chunk had no recognisable words — NOT a mistake, no penalty
  | 'server-unavailable' // Transport failure (down/timeout/401) — NOT a mistake, no penalty
  | 'talqin'          // Talqin triggered — play audio from this position
  | 'complete'        // Student reached end of expected text
  | 'session-end';    // Session ended with results

export interface TasmiEvent {
  type: TasmiEventType;
  data?: {
    matchResult?: MatchResult;
    talqinWordIndex?: number;
    progress?: number;
    result?: TasmiSessionResult;
    recognitionId?: string;
    inferenceMs?: number;
  };
}

export type TasmiEventHandler = (event: TasmiEvent) => void;

interface QueuedAudioChunk {
  audioBlob: Blob;
  recognitionId: string;
}

export class TasmiSession {
  private matcher: SequenceMatcher;
  private config: TasmiConfig;
  private eventHandler: TasmiEventHandler;
  private startTime: number = 0;
  private talqinCount: number = 0;
  private consecutiveErrors: number = 0;
  private errorPositions: Set<number> = new Set();
  private totalWordsCorrect: number = 0;
  private isActive: boolean = false;
  private chunkQueue: QueuedAudioChunk[] = [];
  private processing: boolean = false;
  private lastResult: TasmiSessionResult | null = null;
  private activeRequests: Set<AbortController> = new Set();
  private seenRecognitionIds: Set<string> = new Set();
  private httpRecognitionSequence = 0;

  constructor(
    expectedText: string,
    config: TasmiConfig,
    onEvent: TasmiEventHandler,
  ) {
    this.matcher = new SequenceMatcher(expectedText);
    this.config = config;
    this.eventHandler = onEvent;
  }

  /**
   * Call this when a new audio chunk is ready (from VAD onSpeechEnd).
   * Chunks are queued and processed sequentially to preserve order.
   */
  async processAudioChunk(
    audioBlob: Blob,
    recognitionId?: string,
  ): Promise<void> {
    if (!this.isActive) return;
    if (this.chunkQueue.length >= 3) {
      this.eventHandler({
        type: 'server-unavailable',
        data: { progress: this.matcher.progress },
      });
      return;
    }
    const resolvedRecognitionId = recognitionId ?? this.nextHttpRecognitionId();
    this.chunkQueue = [
      ...this.chunkQueue,
      { audioBlob, recognitionId: resolvedRecognitionId },
    ];
    if (!this.processing) {
      await this.drainQueue();
    }
  }

  private async drainQueue(): Promise<void> {
    this.processing = true;
    while (this.chunkQueue.length > 0 && this.isActive) {
      const chunk = this.chunkQueue[0];
      this.chunkQueue = this.chunkQueue.slice(1);
      await this.processOneChunk(chunk);
    }
    this.processing = false;
  }

  private async processOneChunk(chunk: QueuedAudioChunk): Promise<void> {
    this.eventHandler({ type: 'processing' });

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.config.requestTimeoutMs ?? 8_000,
    );
    this.activeRequests = new Set([...this.activeRequests, controller]);

    try {
      const formData = new FormData();
      formData.append('file', chunk.audioBlob, 'chunk.wav');

      const headers = this.config.apiKey
        ? { 'x-api-key': this.config.apiKey }
        : undefined;

      const transcribeUrl = this.config.serverUrl.endsWith('/transcribe')
        ? this.config.serverUrl
        : `${this.config.serverUrl}/transcribe`;

      const response = await fetch(transcribeUrl, {
        method: 'POST',
        headers,
        body: formData,
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const data: unknown = await response.json();
      const normalizedText = this.readNormalizedText(data);
      if (normalizedText === null) throw new Error('Invalid transcription response');
      this.processRecognizedText(
        normalizedText,
        chunk.recognitionId,
      );
    } catch (err) {
      // end()/cancel() intentionally abort active HTTP work. That lifecycle
      // transition is not a server outage and must not reopen an unavailable UI.
      if (!this.isActive) return;
      console.error('Tasmi transcription error:', err);
      // Transport failure (server down / timeout / non-2xx / network drop). This is
      // NOT a recitation mistake: do not penalise the reciter or fire talqin for
      // words they may have said correctly. Surface it honestly and let the UI pause
      // the session with a "server unavailable" banner + retry.
      this.eventHandler({
        type: 'server-unavailable',
        data: { progress: this.matcher.progress },
      });
      return;
    } finally {
      clearTimeout(timeout);
      this.activeRequests = new Set(
        [...this.activeRequests].filter(active => active !== controller),
      );
    }
  }

  private nextHttpRecognitionId(): string {
    this.httpRecognitionSequence += 1;
    return `http:${this.httpRecognitionSequence}`;
  }

  /** Tentative cumulative text from WebSocket streaming. Never mutates score. */
  previewRecognizedText(
    normalizedText: string,
    recognitionId: string,
    inferenceMs?: number,
  ): void {
    if (!this.isActive || this.seenRecognitionIds.has(recognitionId)) return;
    const matchResult = this.matcher.previewChunk(normalizedText);
    const progress = this.matcher.totalExpectedWords > 0
      ? (matchResult.lastCorrectIndex + 1) / this.matcher.totalExpectedWords
      : 1;
    this.eventHandler({
      type: 'hypothesis',
      data: { matchResult, progress, recognitionId, inferenceMs },
    });
  }

  /** Stable streaming result or HTTP fallback result. Applied exactly once. */
  processRecognizedText(
    normalizedText: string,
    recognitionId: string,
    inferenceMs?: number,
  ): void {
    if (!this.isActive || this.seenRecognitionIds.has(recognitionId)) return;
    this.seenRecognitionIds = new Set([...this.seenRecognitionIds, recognitionId]);

    const previousLastCorrectIndex = this.matcher.lastCorrectIndex;
    const matchResult = this.matcher.matchChunk(normalizedText);
    const newlyCorrectWords = this.getNewlyCorrectWords(
      matchResult,
      previousLastCorrectIndex,
    );
    const eventData = {
      matchResult,
      progress: this.matcher.progress,
      recognitionId,
      inferenceMs,
    };

    if (matchResult.wordsTotal === 0 && matchResult.errors.length === 0) {
      this.eventHandler({ type: 'no-speech', data: eventData });
    } else if (matchResult.errors.length === 0) {
      this.consecutiveErrors = 0;
      this.addWordsCorrect(newlyCorrectWords);
      this.eventHandler({ type: 'match', data: eventData });
    } else {
      this.consecutiveErrors += 1;
      this.addWordsCorrect(newlyCorrectWords);
      this.errorPositions = new Set([
        ...this.errorPositions,
        ...matchResult.errors.map(error => error.position),
      ]);
      this.eventHandler({ type: 'error', data: eventData });
      if (this.consecutiveErrors >= this.config.errorThresholdCount) {
        this.triggerTalqin();
      }
    }

    if (this.matcher.isComplete) {
      this.eventHandler({ type: 'complete', data: { progress: 1 } });
      this.end();
    }
  }

  private readNormalizedText(data: unknown): string | null {
    if (!data || typeof data !== 'object' || !('normalized_text' in data)) return null;
    const value = data.normalized_text;
    return typeof value === 'string' ? value : null;
  }

  private getNewlyCorrectWords(
    matchResult: MatchResult,
    previousLastCorrectIndex: number,
  ): number {
    const rawAdvance = Math.max(0, matchResult.lastCorrectIndex - previousLastCorrectIndex);
    // Positions the cursor advanced past WITHOUT a correct recitation must not
    // score: omitted words (skipped) and substituted words (T-01: the cursor
    // passes an anchored substitution) are errors, not credit. Only errors
    // INSIDE the newly advanced span subtract — a trailing unanchored
    // substitution sits beyond lastCorrectIndex and earned no advance.
    const currentUncreditedPositions = matchResult.errors
      .filter(error =>
        (error.type === 'omission' || error.type === 'substitution') &&
        error.position > previousLastCorrectIndex &&
        error.position <= matchResult.lastCorrectIndex,
      )
      .map(error => error.position);
    // A later correction advances the teaching cursor, but a mistake that was
    // already confirmed in an earlier utterance remains first-pass uncredited.
    // Use a union so the same position is never subtracted twice.
    const historicalUncreditedPositions = [...this.errorPositions].filter(
      position =>
        position > previousLastCorrectIndex &&
        position <= matchResult.lastCorrectIndex,
    );
    const uncreditedInNewSpan = new Set([
      ...currentUncreditedPositions,
      ...historicalUncreditedPositions,
    ]).size;

    return Math.max(0, rawAdvance - uncreditedInNewSpan);
  }

  private addWordsCorrect(words: number): void {
    if (words <= 0) return;
    this.totalWordsCorrect = Math.min(
      this.matcher.totalExpectedWords,
      this.totalWordsCorrect + words,
    );
  }

  /**
   * Call this when silence is detected beyond threshold (from VAD).
   */
  onSilenceTimeout(): void {
    if (!this.isActive) return;
    if (this.matcher.lastCorrectIndex < this.matcher.totalExpectedWords - 1) {
      this.triggerTalqin();
    }
  }

  private triggerTalqin(): void {
    // Exam mode: the examiner stays silent. Mistakes are already tracked in
    // errorPositions/accuracy; reset the streak so the counter doesn't grow
    // unbounded, but give no help and count no talqin.
    if (this.config.talqinEnabled === false) {
      this.consecutiveErrors = 0;
      return;
    }

    this.talqinCount++;
    this.consecutiveErrors = 0;

    const position = this.matcher.getPositionForTalqin();
    this.eventHandler({
      type: 'talqin',
      data: {
        talqinWordIndex: position?.wordIndex,
        progress: this.matcher.progress,
      },
    });
  }

  start(): void {
    this.isActive = true;
    this.startTime = Date.now();
    this.eventHandler({ type: 'ready' });
    this.eventHandler({ type: 'listening' });
  }

  /** Stop all recognition work without grading or emitting a result. */
  cancel(): void {
    if (!this.isActive) return;
    this.deactivate();
  }

  end(): TasmiSessionResult {
    // Idempotent: end() is reachable from both the natural-completion path
    // (matcher.isComplete) and a manual stop. A second call must not re-fire
    // session-end or recompute a longer duration.
    if (this.lastResult) return this.lastResult;
    this.deactivate();
    const durationSeconds = (Date.now() - this.startTime) / 1000;

    const result: TasmiSessionResult = {
      totalWords: this.matcher.totalExpectedWords,
      wordsCorrect: this.totalWordsCorrect,
      talqinCount: this.talqinCount,
      errorPositions: Array.from(this.errorPositions),
      accuracy: this.matcher.totalExpectedWords > 0
        ? (this.totalWordsCorrect / this.matcher.totalExpectedWords) * 100
        : 0,
      durationSeconds,
    };

    this.lastResult = result;
    this.eventHandler({ type: 'session-end', data: { result } });
    return result;
  }

  private deactivate(): void {
    this.isActive = false;
    this.chunkQueue = [];
    for (const controller of this.activeRequests) controller.abort();
    this.activeRequests = new Set();
  }
}
