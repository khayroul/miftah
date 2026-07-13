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
  };
}

export type TasmiEventHandler = (event: TasmiEvent) => void;

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
  private chunkQueue: Blob[] = [];
  private processing: boolean = false;
  private lastResult: TasmiSessionResult | null = null;

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
  async processAudioChunk(audioBlob: Blob): Promise<void> {
    if (!this.isActive) return;
    this.chunkQueue = [...this.chunkQueue, audioBlob];
    if (!this.processing) {
      await this.drainQueue();
    }
  }

  private async drainQueue(): Promise<void> {
    this.processing = true;
    while (this.chunkQueue.length > 0 && this.isActive) {
      const blob = this.chunkQueue[0];
      this.chunkQueue = this.chunkQueue.slice(1);
      await this.processOneChunk(blob);
    }
    this.processing = false;
  }

  private async processOneChunk(audioBlob: Blob): Promise<void> {
    this.eventHandler({ type: 'processing' });

    try {
      const formData = new FormData();
      formData.append('file', audioBlob, 'chunk.wav');

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

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
      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const data = await response.json();

      // Match against expected
      const previousLastCorrectIndex = this.matcher.lastCorrectIndex;
      const matchResult = this.matcher.matchChunk(data.normalized_text);
      const newlyCorrectWords = this.getNewlyCorrectWords(
        matchResult,
        previousLastCorrectIndex,
      );

      if (matchResult.wordsTotal === 0 && matchResult.errors.length === 0) {
        // Empty transcription (Whisper heard silence / background noise / a breath)
        // is NOT a recitation mistake. Do not penalise or advance the error count;
        // just re-prompt. A genuinely stuck reciter is caught by the silence-timeout
        // path (onSilenceTimeout), which fires talqin on real inactivity.
        this.eventHandler({
          type: 'no-speech',
          data: { matchResult, progress: this.matcher.progress },
        });
      } else if (matchResult.errors.length === 0) {
        this.consecutiveErrors = 0;
        this.addWordsCorrect(newlyCorrectWords);
        this.eventHandler({
          type: 'match',
          data: { matchResult, progress: this.matcher.progress },
        });
      } else {
        this.consecutiveErrors++;
        this.addWordsCorrect(newlyCorrectWords);
        matchResult.errors.forEach(e => this.errorPositions.add(e.position));

        this.eventHandler({
          type: 'error',
          data: { matchResult, progress: this.matcher.progress },
        });

        if (this.consecutiveErrors >= this.config.errorThresholdCount) {
          this.triggerTalqin();
        }
      }

      if (this.matcher.isComplete) {
        this.eventHandler({ type: 'complete', data: { progress: 1 } });
        this.end();
      }
    } catch (err) {
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
    }

    if (this.isActive) {
      this.eventHandler({ type: 'listening' });
    }
  }

  private getNewlyCorrectWords(
    matchResult: MatchResult,
    previousLastCorrectIndex: number,
  ): number {
    const rawAdvance = Math.max(0, matchResult.lastCorrectIndex - previousLastCorrectIndex);
    const omissionsInNewSpan = matchResult.errors.filter(
      error => error.type === 'omission' && error.position > previousLastCorrectIndex,
    ).length;

    return Math.max(0, rawAdvance - omissionsInNewSpan);
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

  end(): TasmiSessionResult {
    // Idempotent: end() is reachable from both the natural-completion path
    // (matcher.isComplete) and a manual stop. A second call must not re-fire
    // session-end or recompute a longer duration.
    if (this.lastResult) return this.lastResult;
    this.isActive = false;
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
}
