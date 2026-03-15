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
  private config: TalqinConfig;
  private timestampMap: Map<string, WordSegment[]> = new Map();
  private timeUpdateHandler: (() => void) | null = null;

  constructor(config: TalqinConfig) {
    this.config = config;
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

    this.stop();

    this.audio = new Audio(audioUrl);
    this.audio.currentTime = startTime;

    this.timeUpdateHandler = () => {
      if (this.audio && this.audio.currentTime >= endTime) {
        this.stop();
        this.config.onPlaybackEnd();
      }
    };

    this.audio.addEventListener('timeupdate', this.timeUpdateHandler);
    this.audio.addEventListener('ended', () => {
      this.config.onPlaybackEnd();
    }, { once: true });

    await this.audio.play();
  }

  /**
   * Fallback: play full ayah audio without seeking.
   */
  private async playFullAyah(surah: number, ayah: number): Promise<void> {
    this.stop();

    const audioUrl = buildAudioUrl(surah, ayah);
    this.audio = new Audio(audioUrl);
    this.audio.addEventListener('ended', () => {
      this.config.onPlaybackEnd();
    }, { once: true });

    await this.audio.play();
  }

  stop(): void {
    if (this.audio) {
      this.audio.pause();
      if (this.timeUpdateHandler) {
        this.audio.removeEventListener('timeupdate', this.timeUpdateHandler);
        this.timeUpdateHandler = null;
      }
      this.audio = null;
    }
  }
}
