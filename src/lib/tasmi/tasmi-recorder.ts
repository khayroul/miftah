/**
 * Audio recorder with VAD (Voice Activity Detection).
 * Captures mic audio, detects speech chunks, provides audio blobs for transcription.
 */

import { MicVAD } from '@ricky0123/vad-web';

export interface RecorderConfig {
  /** Seconds of silence before firing onSilenceTimeout (default: 6) */
  silenceTimeoutSeconds: number;
  /** Called when a speech segment ends — provides audio blob */
  onSpeechEnd: (audioBlob: Blob) => void;
  /** Called when silence exceeds threshold */
  onSilenceTimeout: () => void;
  /** Called on errors */
  onError: (error: Error) => void;
}

export class TasmiRecorder {
  private vad: MicVAD | null = null;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private config: RecorderConfig;
  private isListening: boolean = false;

  constructor(config: RecorderConfig) {
    this.config = config;
  }

  async start(): Promise<void> {
    try {
      this.vad = await MicVAD.new({
        model: 'v5',
        baseAssetPath: '/',
        onnxWASMBasePath: '/',
        // Tuned for Quran recitation (tajweed has natural pauses between words)
        positiveSpeechThreshold: 0.3,
        negativeSpeechThreshold: 0.15,
        minSpeechMs: 250,
        redemptionMs: 900,
        onSpeechEnd: (audio: Float32Array) => {
          console.log('[tasmi-recorder] speech ended, samples:', audio.length);
          // Reset silence timer — student is speaking
          this.resetSilenceTimer();

          // Convert Float32Array to WAV blob
          const wavBlob = float32ToWavBlob(audio, 16000);
          console.log('[tasmi-recorder] WAV blob size:', wavBlob.size);
          this.config.onSpeechEnd(wavBlob);
        },
        onSpeechStart: () => {
          console.log('[tasmi-recorder] speech started');
          // Student started speaking — reset silence timer
          this.resetSilenceTimer();
        },
      });

      this.vad.start();
      this.isListening = true;
      this.startSilenceTimer();
      console.log('[tasmi-recorder] VAD started, listening for speech');
    } catch (err) {
      this.config.onError(
        err instanceof Error ? err : new Error('Failed to start mic')
      );
    }
  }

  stop(): void {
    this.isListening = false;
    this.clearSilenceTimer();
    if (this.vad) {
      this.vad.destroy();
      this.vad = null;
    }
  }

  /**
   * Temporarily pause listening (e.g. during talqin playback).
   */
  pause(): void {
    this.isListening = false;
    this.clearSilenceTimer();
    if (this.vad) {
      this.vad.pause();
    }
  }

  /**
   * Resume listening after pause.
   */
  resume(): void {
    this.isListening = true;
    if (this.vad) {
      this.vad.start();
    }
    this.startSilenceTimer();
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
