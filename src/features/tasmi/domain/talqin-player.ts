/**
 * Talqin player — plays Quran audio from a specific word position.
 * Uses EveryAyah audio URLs + quran-align timestamp data for precise seeking.
 */

export interface WordSegment {
  /** Word start index (0-based within ayah) */
  startWord: number;
  /** Word end index (exclusive) */
  endWord: number;
  /** Start time in milliseconds */
  startMs: number;
  /** End time in milliseconds */
  endMs: number;
}

export interface AyahTimestamps {
  surah: number;
  ayah: number;
  segments: WordSegment[];
}

/** Raw format from cpfair/quran-align JSON: [startWordIdx, endWordIdx, startMs, endMs] */
type RawSegment = [number, number, number, number];

interface RawAyahEntry {
  surah: number;
  ayah: number;
  segments: RawSegment[];
}

export interface TalqinConfig {
  /** Number of words to play for talqin prompt (default: 5) */
  wordsToPlay: number;
  /** Callback when talqin playback finishes */
  onPlaybackEnd: () => void;
}

const DEFAULT_EVERYAYAH_BASE_URL = 'https://everyayah.com/data';
const DEFAULT_EVERYAYAH_RECITER = 'Alafasy_128kbps';

function buildAudioUrl(surah: number, ayah: number): string {
  const baseUrl =
    typeof window !== 'undefined'
      ? (process.env.NEXT_PUBLIC_EVERYAYAH_BASE_URL?.trim() || DEFAULT_EVERYAYAH_BASE_URL)
      : DEFAULT_EVERYAYAH_BASE_URL;
  const reciter =
    typeof window !== 'undefined'
      ? (process.env.NEXT_PUBLIC_EVERYAYAH_RECITER?.trim() || DEFAULT_EVERYAYAH_RECITER)
      : DEFAULT_EVERYAYAH_RECITER;
  const pad = (n: number) => String(n).padStart(3, '0');
  return `${baseUrl}/${reciter}/${pad(surah)}${pad(ayah)}.mp3`;
}

export class TalqinPlayer {
  private audio: HTMLAudioElement | null = null;
  private sharedAudio: HTMLAudioElement | null = null;
  private config: TalqinConfig;
  private timestampMap: Map<string, WordSegment[]> = new Map();
  private timeUpdateHandler: (() => void) | null = null;
  private endedHandler: (() => void) | null = null;

  constructor(config: TalqinConfig) {
    this.config = config;
  }

  /**
   * Attach a gesture-primed HTMLAudioElement to reuse for all playback.
   *
   * iOS Safari only allows .play() on elements unlocked inside a user gesture.
   * Talqin fires from transcription callbacks / silence timers (never a tap),
   * so a fresh `new Audio()` there is blocked and the corrective prompt is
   * silently skipped. The session UI primes ONE element inside the "Mula" tap
   * and hands it here.
   */
  attachAudioElement(element: HTMLAudioElement): void {
    this.sharedAudio = element;
  }

  /**
   * Acquire the playback element for a URL: the primed shared element when
   * available (iOS-safe), else a fresh Audio (desktop fallback).
   */
  private prepareAudio(url: string): HTMLAudioElement {
    this.stop();
    const el = this.sharedAudio ?? new Audio();
    el.src = url;
    this.audio = el;
    return el;
  }

  /**
   * Load raw quran-align data for a set of ayahs.
   * Call this when the student selects their recitation range.
   */
  loadFromRawData(rawEntries: RawAyahEntry[]): void {
    for (const entry of rawEntries) {
      const key = `${entry.surah}:${entry.ayah}`;
      const segments: WordSegment[] = entry.segments.map(([startWord, endWord, startMs, endMs]) => ({
        startWord,
        endWord,
        startMs,
        endMs,
      }));
      this.timestampMap.set(key, segments);
    }
  }

  /**
   * Load word timestamps for a single surah/ayah.
   */
  loadTimestamps(surah: number, ayah: number, segments: WordSegment[]): void {
    this.timestampMap.set(`${surah}:${ayah}`, segments);
  }

  /**
   * Play talqin from a specific word position within an ayah.
   * @param surah - Surah number
   * @param ayah - Ayah number
   * @param wordIndex - Word index within the ayah to start from
   */
  async play(surah: number, ayah: number, wordIndex: number): Promise<void> {
    const key = `${surah}:${ayah}`;
    const segments = this.timestampMap.get(key);

    if (!segments || segments.length === 0) {
      // No timestamp data — fall back to playing full ayah
      await this.playFullAyah(surah, ayah);
      return;
    }

    // Find the segment containing the target word
    const startSegIdx = segments.findIndex(
      s => wordIndex >= s.startWord && wordIndex < s.endWord
    );
    if (startSegIdx === -1) {
      await this.playFullAyah(surah, ayah);
      return;
    }

    const startSegment = segments[startSegIdx];

    // Find end segment: play wordsToPlay words ahead
    const endWordTarget = wordIndex + this.config.wordsToPlay;
    let endSegIdx = startSegIdx;
    for (let i = startSegIdx; i < segments.length; i++) {
      endSegIdx = i;
      if (segments[i].endWord >= endWordTarget) break;
    }
    const endSegment = segments[endSegIdx];

    const audioUrl = buildAudioUrl(surah, ayah);
    const startTime = startSegment.startMs / 1000;
    const endTime = endSegment.endMs / 1000;

    await this.playSegment(audioUrl, startTime, endTime);
  }

  /**
   * Play a specific word range within an ayah.
   * Used by tebuk (prompt audio) and unveil (initial prompt).
   */
  async playRange(
    surah: number,
    ayah: number,
    startWordIdx: number,
    endWordIdx: number,
  ): Promise<void> {
    const key = `${surah}:${ayah}`;
    const segments = this.timestampMap.get(key);

    if (!segments || segments.length === 0) {
      await this.playFullAyah(surah, ayah);
      return;
    }

    const startSeg = segments.find(
      s => startWordIdx >= s.startWord && startWordIdx < s.endWord
    );
    const endSeg = segments.find(
      s => endWordIdx >= s.startWord && endWordIdx < s.endWord
    );

    if (!startSeg || !endSeg) {
      await this.playFullAyah(surah, ayah);
      return;
    }

    const audioUrl = buildAudioUrl(surah, ayah);
    const startTime = startSeg.startMs / 1000;
    const endTime = endSeg.endMs / 1000;

    await this.playSegment(audioUrl, startTime, endTime);
  }

  /**
   * Shared playback core: play [startTime, endTime] of a URL on the
   * (possibly gesture-primed) element, firing onPlaybackEnd exactly once.
   */
  private async playSegment(url: string, startTime: number, endTime: number): Promise<void> {
    const el = this.prepareAudio(url);
    el.currentTime = startTime;

    this.timeUpdateHandler = () => {
      if (this.audio && this.audio.currentTime >= endTime) {
        this.stop();
        this.config.onPlaybackEnd();
      }
    };
    this.endedHandler = () => {
      this.stop();
      this.config.onPlaybackEnd();
    };

    el.addEventListener('timeupdate', this.timeUpdateHandler);
    el.addEventListener('ended', this.endedHandler);

    await el.play();
  }

  /**
   * Play one whole ayah aloud. Mode B (juzuk exam) uses this as the
   * read-aloud START prompt for the test ayah.
   */
  async playAyah(surah: number, ayah: number): Promise<void> {
    await this.playFullAyah(surah, ayah);
  }

  /**
   * Fallback: play full ayah audio without seeking.
   */
  private async playFullAyah(surah: number, ayah: number): Promise<void> {
    const el = this.prepareAudio(buildAudioUrl(surah, ayah));
    el.currentTime = 0;

    this.endedHandler = () => {
      this.stop();
      this.config.onPlaybackEnd();
    };
    el.addEventListener('ended', this.endedHandler);

    await el.play();
  }

  stop(): void {
    if (this.audio) {
      this.audio.pause();
      if (this.timeUpdateHandler) {
        this.audio.removeEventListener('timeupdate', this.timeUpdateHandler);
        this.timeUpdateHandler = null;
      }
      if (this.endedHandler) {
        this.audio.removeEventListener('ended', this.endedHandler);
        this.endedHandler = null;
      }
      // The shared element is reused across plays (it carries the iOS gesture
      // unlock) — never discard it, only detach.
      this.audio = null;
    }
  }
}
