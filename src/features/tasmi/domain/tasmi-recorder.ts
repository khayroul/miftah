/**
 * Audio recorder with VAD (Voice Activity Detection).
 * Captures mic audio, detects speech chunks, provides audio blobs for transcription.
 */

import { MicVAD } from '@ricky0123/vad-web';

/** Classified mic-start failure, so the UI can show actionable localized copy
 * instead of a raw browser DOMException string. */
export type TasmiRecorderErrorKind = 'permission-denied' | 'no-mic' | 'unknown';

export class TasmiRecorderError extends Error {
  readonly kind: TasmiRecorderErrorKind;

  constructor(kind: TasmiRecorderErrorKind, message: string) {
    super(message);
    this.name = 'TasmiRecorderError';
    this.kind = kind;
  }
}

function classifyMicError(err: unknown): TasmiRecorderError {
  const name = err instanceof DOMException || err instanceof Error ? err.name : '';
  const message = err instanceof Error ? err.message : 'Failed to start mic';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
    return new TasmiRecorderError('permission-denied', message);
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') {
    return new TasmiRecorderError('no-mic', message);
  }
  return new TasmiRecorderError('unknown', message);
}

export interface RecorderConfig {
  /** Seconds of silence before firing onSilenceTimeout (default: 6) */
  silenceTimeoutSeconds: number;
  /** Called when a speech segment ends — provides audio blob */
  onSpeechEnd: (audioBlob: Blob) => void;
  /** Called when silence exceeds threshold */
  onSilenceTimeout: () => void;
  /** Called on errors — always a TasmiRecorderError with a classified kind */
  onError: (error: TasmiRecorderError) => void;
}

export class TasmiRecorder {
  private vad: MicVAD | null = null;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private config: RecorderConfig;
  private isListening: boolean = false;
  private startAttempt = 0;

  constructor(config: RecorderConfig) {
    this.config = config;
  }

  async start(): Promise<boolean> {
    const attempt = ++this.startAttempt;
    let createdVad: MicVAD | null = null;
    try {
      createdVad = await MicVAD.new({
        model: 'v5',
        baseAssetPath: '/',
        onnxWASMBasePath: '/',
        // Tuned for Quran recitation (tajweed has natural pauses between words)
        positiveSpeechThreshold: 0.3,
        negativeSpeechThreshold: 0.15,
        minSpeechMs: 250,
        redemptionMs: 900,
        onSpeechEnd: (audio: Float32Array) => {
          this.resetSilenceTimer();
          const wavBlob = float32ToWavBlob(audio, 16000);
          this.config.onSpeechEnd(wavBlob);
        },
        onSpeechStart: () => {
          this.resetSilenceTimer();
        },
      });

      if (attempt !== this.startAttempt) {
        await this.destroyVad(createdVad, "cancelled microphone start");
        return false;
      }

      this.vad = createdVad;
      await createdVad.start();
      if (attempt !== this.startAttempt || this.vad !== createdVad) return false;
      this.isListening = true;
      this.startSilenceTimer();
      return true;
    } catch (err) {
      this.isListening = false;
      this.clearSilenceTimer();
      const ownsCreatedVad = createdVad !== null && this.vad === createdVad;
      if (ownsCreatedVad) this.vad = null;
      if (ownsCreatedVad && createdVad) {
        await this.destroyVad(createdVad, "failed microphone start");
      }
      if (attempt !== this.startAttempt) return false;
      this.config.onError(classifyMicError(err));
      return false;
    }
  }

  stop(): void {
    this.startAttempt += 1;
    this.isListening = false;
    this.clearSilenceTimer();
    if (this.vad) {
      const vad = this.vad;
      this.vad = null;
      void this.destroyVad(vad, "stop microphone");
    }
  }

  /**
   * Temporarily pause listening (e.g. during talqin playback).
   */
  pause(): void {
    this.isListening = false;
    this.clearSilenceTimer();
    if (this.vad) {
      void this.vad.pause().catch((error: unknown) => {
        console.error("[tasmi/recorder] Failed to pause microphone", error);
      });
    }
  }

  /**
   * Resume listening after pause.
   */
  resume(): void {
    const vad = this.vad;
    if (!vad) return;
    this.isListening = true;
    void vad.start()
      .then(() => {
        if (this.isListening && this.vad === vad) this.startSilenceTimer();
      })
      .catch((error: unknown) => {
        if (this.vad !== vad) return;
        this.isListening = false;
        this.clearSilenceTimer();
        this.config.onError(classifyMicError(error));
      });
  }

  private async destroyVad(vad: MicVAD, action: string): Promise<void> {
    try {
      await vad.destroy();
    } catch (error) {
      console.error(`[tasmi/recorder] Failed to ${action}`, error);
    }
  }

  private startSilenceTimer(): void {
    this.clearSilenceTimer();
    if (this.isListening) {
      this.silenceTimer = setTimeout(() => {
        if (this.isListening) {
          this.config.onSilenceTimeout();
          // Do NOT restart — wait for speech to reset the timer
        }
      }, this.config.silenceTimeoutSeconds * 1000);
    }
  }

  private resetSilenceTimer(): void {
    this.startSilenceTimer();
  }

  private clearSilenceTimer(): void {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }
}

/**
 * Convert Float32Array PCM audio to WAV Blob.
 */
function float32ToWavBlob(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  // WAV header
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);           // Subchunk1Size
  view.setUint16(20, 1, true);            // PCM format
  view.setUint16(22, 1, true);            // Mono
  view.setUint32(24, sampleRate, true);   // Sample rate
  view.setUint32(28, sampleRate * 2, true); // Byte rate
  view.setUint16(32, 2, true);            // Block align
  view.setUint16(34, 16, true);           // Bits per sample

  writeString(36, 'data');
  view.setUint32(40, samples.length * 2, true);

  // PCM data
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    offset += 2;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}
