/**
 * Tasmi' session manager.
 * Orchestrates the full tasmi' flow: recording → transcription → matching → talqin.
 */

import { SequenceMatcher, MatchResult } from './sequence-matcher';

export interface TasmiConfig {
  /** Server URL for transcription */
  serverUrl: string;
  /** API key for server auth */
  apiKey: string;
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
  | 'error'           // Recitation error detected
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
      void this.drainQueue();
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

      const response = await fetch(`${this.config.serverUrl}/transcribe`, {
        method: 'POST',
        headers: { 'x-api-key': this.config.apiKey },
        body: formData,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const data = await response.json();

      // Match against expected
      const matchResult = this.matcher.matchChunk(data.normalized_text);

      if (matchResult.isClean && matchResult.wordsCorrect > 0) {
        this.consecutiveErrors = 0;
        this.totalWordsCorrect += matchResult.wordsCorrect;
        this.eventHandler({
          type: 'match',
          data: { matchResult, progress: this.matcher.progress },
        });
      } else if (matchResult.errors.length > 0 || matchResult.wordsTotal > 0) {
        this.consecutiveErrors++;
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
    }

    if (this.isActive) {
      this.eventHandler({ type: 'listening' });
    }
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

    this.eventHandler({ type: 'session-end', data: { result } });
    return result;
  }
}
