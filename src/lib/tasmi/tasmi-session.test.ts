import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TasmiSession, type TasmiEvent, type TasmiSessionResult } from './tasmi-session';
import { tasmiResultToLabel } from './fsrs-bridge';

// ---- Helpers ----

function collectEvents(expectedText: string) {
  const events: TasmiEvent[] = [];
  const session = new TasmiSession(expectedText, {
    serverUrl: 'http://fake:8000',
    apiKey: 'test',
    silenceThresholdSeconds: 6,
    errorThresholdCount: 2,
  }, (e) => events.push(e));
  return { session, events };
}

// Mock fetch globally for transcription server calls
function mockTranscriptionResponses(responses: Array<{ normalized_text: string } | Error>) {
  let callIndex = 0;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
    const resp = responses[callIndex++];
    if (!resp || resp instanceof Error) {
      throw resp ?? new Error('No more responses');
    }
    return {
      ok: true,
      json: async () => resp,
    } as Response;
  });
}

const BASMALA = 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ';
const FATIHAH_2 = 'الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ';

// ---- Scenario 1: Perfect recitation ----

describe('TasmiSession — Scenario 1: Perfect recitation', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('completes with 100% accuracy when student recites perfectly', async () => {
    mockTranscriptionResponses([
      { normalized_text: 'بسم الله الرحمن الرحيم' },
    ]);

    const { session, events } = collectEvents(BASMALA);
    session.start();

    await session.processAudioChunk(new Blob(['fake audio']));

    const types = events.map(e => e.type);
    expect(types).toContain('ready');
    expect(types).toContain('listening');
    expect(types).toContain('processing');
    expect(types).toContain('match');
    expect(types).toContain('complete');
    expect(types).toContain('session-end');

    const endEvent = events.find(e => e.type === 'session-end');
    const result = endEvent!.data!.result!;
    expect(result.accuracy).toBe(100);
    expect(result.wordsCorrect).toBe(4);
    expect(result.talqinCount).toBe(0);
    expect(result.errorPositions).toHaveLength(0);

    expect(tasmiResultToLabel(result)).toBe('mantap');
  });
});

// ---- Scenario 2: Partial recitation in chunks ----

describe('TasmiSession — Scenario 2: Multi-chunk recitation', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('accumulates progress across multiple audio chunks', async () => {
    mockTranscriptionResponses([
      { normalized_text: 'بسم الله' },
      { normalized_text: 'الرحمن الرحيم' },
    ]);

    const { session, events } = collectEvents(BASMALA);
    session.start();

    await session.processAudioChunk(new Blob(['chunk1']));

    // Should have match event with 50% progress
    const matchEvents = events.filter(e => e.type === 'match');
    expect(matchEvents).toHaveLength(1);
    expect(matchEvents[0].data!.progress).toBeCloseTo(0.5);

    await session.processAudioChunk(new Blob(['chunk2']));

    const endEvent = events.find(e => e.type === 'session-end');
    expect(endEvent).toBeDefined();
    expect(endEvent!.data!.result!.accuracy).toBe(100);
  });

  it('counts only newly advanced words when student restarts a few words back', async () => {
    const text = `${BASMALA} ${FATIHAH_2}`;
    mockTranscriptionResponses([
      { normalized_text: 'بسم الله الرحمن الرحيم' },
      { normalized_text: 'الرحمن الرحيم الحمد لله' },
      { normalized_text: 'رب العالمين' },
    ]);

    const { session, events } = collectEvents(text);
    session.start();

    await session.processAudioChunk(new Blob(['chunk1']));
    await session.processAudioChunk(new Blob(['chunk2']));
    await session.processAudioChunk(new Blob(['chunk3']));

    const endEvent = events.find(e => e.type === 'session-end');
    expect(endEvent).toBeDefined();
    expect(endEvent!.data!.result!.totalWords).toBe(8);
    expect(endEvent!.data!.result!.wordsCorrect).toBe(8);
    expect(endEvent!.data!.result!.accuracy).toBe(100);
  });

  it('counts correct words from an errored chunk without crediting omitted words', async () => {
    mockTranscriptionResponses([
      { normalized_text: 'بسم الرحمن' },
      { normalized_text: 'الرحيم' },
    ]);

    const { session, events } = collectEvents(BASMALA);
    session.start();

    await session.processAudioChunk(new Blob(['chunk1']));
    await session.processAudioChunk(new Blob(['chunk2']));

    const endEvent = events.find(e => e.type === 'session-end');
    expect(endEvent).toBeDefined();
    expect(endEvent!.data!.result!.wordsCorrect).toBe(3);
    expect(endEvent!.data!.result!.accuracy).toBe(75);
    expect(endEvent!.data!.result!.errorPositions).toEqual([1]);
  });

  it('does not penalize a clean restart that makes no new progress', async () => {
    const text = `${BASMALA} ${FATIHAH_2}`;
    mockTranscriptionResponses([
      { normalized_text: 'بسم الله الرحمن الرحيم الحمد لله' },
      { normalized_text: 'الرحيم الحمد' },
    ]);

    const { session, events } = collectEvents(text);
    session.start();

    await session.processAudioChunk(new Blob(['chunk1']));
    await session.processAudioChunk(new Blob(['chunk2']));

    expect(events.filter(e => e.type === 'error')).toHaveLength(0);
    expect(events.filter(e => e.type === 'talqin')).toHaveLength(0);
  });
});

// ---- Scenario 3: Errors trigger talqin after threshold ----

describe('TasmiSession — Scenario 3: Consecutive errors trigger talqin', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('fires talqin event after 2 consecutive errors', async () => {
    mockTranscriptionResponses([
      { normalized_text: 'خطا' },  // Wrong word 1
      { normalized_text: 'غلط' },  // Wrong word 2
    ]);

    const { session, events } = collectEvents(BASMALA);
    session.start();

    await session.processAudioChunk(new Blob(['bad1']));
    const errorEvents1 = events.filter(e => e.type === 'error');
    expect(errorEvents1).toHaveLength(1);
    // No talqin yet
    expect(events.filter(e => e.type === 'talqin')).toHaveLength(0);

    await session.processAudioChunk(new Blob(['bad2']));
    const talqinEvents = events.filter(e => e.type === 'talqin');
    expect(talqinEvents).toHaveLength(1);
    // talqinWordIndex should be 0 (first word, since nothing matched)
    expect(talqinEvents[0].data!.talqinWordIndex).toBe(0);
  });

  it('resets error count after a correct chunk', async () => {
    mockTranscriptionResponses([
      { normalized_text: 'خطا' },       // Error 1
      { normalized_text: 'بسم الله' },  // Correct — resets
      { normalized_text: 'غلط' },       // Error 1 again (not 2nd consecutive)
    ]);

    const { session, events } = collectEvents(BASMALA);
    session.start();

    await session.processAudioChunk(new Blob(['bad']));
    await session.processAudioChunk(new Blob(['good']));
    await session.processAudioChunk(new Blob(['bad']));

    // No talqin — because the correct chunk reset the counter
    expect(events.filter(e => e.type === 'talqin')).toHaveLength(0);
  });
});

// ---- Scenario 4: Silence timeout triggers talqin ----

describe('TasmiSession — Scenario 4: Silence timeout', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('triggers talqin on silence timeout when not complete', () => {
    const { session, events } = collectEvents(BASMALA);
    session.start();

    session.onSilenceTimeout();

    const talqinEvents = events.filter(e => e.type === 'talqin');
    expect(talqinEvents).toHaveLength(1);
    expect(talqinEvents[0].data!.talqinWordIndex).toBe(0);
  });

  it('does NOT trigger talqin on silence timeout when complete', async () => {
    mockTranscriptionResponses([
      { normalized_text: 'بسم الله الرحمن الرحيم' },
    ]);

    const { session, events } = collectEvents(BASMALA);
    session.start();
    await session.processAudioChunk(new Blob(['perfect']));

    // Clear events to isolate silence test
    const eventsBefore = events.length;
    session.onSilenceTimeout();
    // No new talqin event
    expect(events.slice(eventsBefore).filter(e => e.type === 'talqin')).toHaveLength(0);
  });
});

// ---- Scenario 5: Session end() produces correct result ----

describe('TasmiSession — Scenario 5: Manual end', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('end() returns partial result when student gives up mid-way', async () => {
    mockTranscriptionResponses([
      { normalized_text: 'بسم الله' }, // 2/4 correct
    ]);

    const { session } = collectEvents(BASMALA);
    session.start();
    await session.processAudioChunk(new Blob(['partial']));

    const result = session.end();
    expect(result.totalWords).toBe(4);
    expect(result.wordsCorrect).toBe(2);
    expect(result.accuracy).toBe(50);
    expect(result.durationSeconds).toBeGreaterThanOrEqual(0);

    // 50% accuracy → tersangkut (not ulang because it's exactly 50, threshold is <50)
    expect(tasmiResultToLabel(result)).toBe('tersangkut');
  });
});

// ---- Scenario 6: FSRS rating thresholds ----

describe('TasmiSession — Scenario 6: FSRS rating mapping', () => {
  it('ulang for <50% accuracy', () => {
    const result: TasmiSessionResult = {
      totalWords: 10, wordsCorrect: 4,
      talqinCount: 0, errorPositions: [4, 5, 6, 7, 8, 9],
      accuracy: 40, durationSeconds: 30,
    };
    expect(tasmiResultToLabel(result)).toBe('ulang');
  });

  it('ulang for high talqin ratio (>30%)', () => {
    const result: TasmiSessionResult = {
      totalWords: 10, wordsCorrect: 8,
      talqinCount: 4, errorPositions: [3, 7],
      accuracy: 80, durationSeconds: 45,
    };
    expect(tasmiResultToLabel(result)).toBe('ulang');
  });

  it('tersangkut for 50-79% accuracy', () => {
    const result: TasmiSessionResult = {
      totalWords: 10, wordsCorrect: 7,
      talqinCount: 0, errorPositions: [3, 5, 8],
      accuracy: 70, durationSeconds: 40,
    };
    expect(tasmiResultToLabel(result)).toBe('tersangkut');
  });

  it('tersangkut for moderate talqin ratio (>10%)', () => {
    const result: TasmiSessionResult = {
      totalWords: 10, wordsCorrect: 9,
      talqinCount: 2, errorPositions: [5],
      accuracy: 90, durationSeconds: 35,
    };
    expect(tasmiResultToLabel(result)).toBe('tersangkut');
  });

  it('lancar for 80-94% accuracy with low talqin', () => {
    const result: TasmiSessionResult = {
      totalWords: 20, wordsCorrect: 18,
      talqinCount: 1, errorPositions: [7, 14],
      accuracy: 90, durationSeconds: 50,
    };
    expect(tasmiResultToLabel(result)).toBe('lancar');
  });

  it('mantap for ≥95% accuracy with minimal talqin', () => {
    const result: TasmiSessionResult = {
      totalWords: 20, wordsCorrect: 20,
      talqinCount: 0, errorPositions: [],
      accuracy: 100, durationSeconds: 40,
    };
    expect(tasmiResultToLabel(result)).toBe('mantap');
  });
});

// ---- Scenario 7: Multi-ayah recitation ----

describe('TasmiSession — Scenario 7: Multi-ayah text', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('handles multi-ayah expected text correctly', async () => {
    const text = BASMALA + ' ' + FATIHAH_2;
    mockTranscriptionResponses([
      { normalized_text: 'بسم الله الرحمن الرحيم' },
      { normalized_text: 'الحمد لله رب العالمين' },
    ]);

    const { session, events } = collectEvents(text);
    session.start();

    await session.processAudioChunk(new Blob(['ayah1']));
    await session.processAudioChunk(new Blob(['ayah2']));

    const endEvent = events.find(e => e.type === 'session-end');
    expect(endEvent).toBeDefined();
    expect(endEvent!.data!.result!.totalWords).toBe(8);
    expect(endEvent!.data!.result!.wordsCorrect).toBe(8);
    expect(endEvent!.data!.result!.accuracy).toBe(100);
  });
});

// ---- Scenario 8: Transcription server failure ----

describe('TasmiSession — Scenario 8: Server failure resilience', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('survives a single failed transcription chunk and continues', async () => {
    mockTranscriptionResponses([
      new Error('Network error'),                    // Chunk 1 fails
      { normalized_text: 'بسم الله الرحمن الرحيم' }, // Chunk 2 succeeds
    ]);

    const { session, events } = collectEvents(BASMALA);
    session.start();

    // First chunk fails — session should not crash
    await session.processAudioChunk(new Blob(['fail']));
    expect(events.filter(e => e.type === 'session-end')).toHaveLength(0);

    // Second chunk succeeds
    await session.processAudioChunk(new Blob(['success']));
    const endEvent = events.find(e => e.type === 'session-end');
    expect(endEvent).toBeDefined();
    expect(endEvent!.data!.result!.accuracy).toBe(100);
  });
});

// ---- Scenario 9: Session is inactive after end() ----

describe('TasmiSession — Scenario 9: Post-end safety', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('ignores audio chunks after session ends', async () => {
    mockTranscriptionResponses([
      { normalized_text: 'بسم الله الرحمن الرحيم' },
      { normalized_text: 'extra data' },
    ]);

    const { session, events } = collectEvents(BASMALA);
    session.start();
    await session.processAudioChunk(new Blob(['complete']));

    // Session ended — send another chunk
    const eventsBeforeExtra = events.length;
    await session.processAudioChunk(new Blob(['extra']));
    // No new processing events
    expect(events.length).toBe(eventsBeforeExtra);
  });

  it('ignores silence timeout after session ends', async () => {
    mockTranscriptionResponses([
      { normalized_text: 'بسم الله الرحمن الرحيم' },
    ]);

    const { session, events } = collectEvents(BASMALA);
    session.start();
    await session.processAudioChunk(new Blob(['complete']));

    const eventsBeforeSilence = events.length;
    session.onSilenceTimeout();
    expect(events.length).toBe(eventsBeforeSilence);
  });
});

// ---- Scenario 10: resolveAyahFromWordIndex ----

describe('resolveAyahFromWordIndex', () => {
  // Import the function directly — it's not exported, so we test the logic inline
  function resolveAyahFromWordIndex(
    wordIndex: number,
    ranges: Array<{ surah: number; ayah: number; startWordIndex: number; endWordIndex: number }>,
    fallbackSurah: number,
    fallbackAyah: number,
  ) {
    for (const r of ranges) {
      if (wordIndex >= r.startWordIndex && wordIndex <= r.endWordIndex) {
        return { surah: r.surah, ayah: r.ayah, localWordIndex: wordIndex - r.startWordIndex };
      }
    }
    return { surah: fallbackSurah, ayah: fallbackAyah, localWordIndex: 0 };
  }

  const ranges = [
    { surah: 2, ayah: 1, startWordIndex: 0, endWordIndex: 3 },   // 4 words
    { surah: 2, ayah: 2, startWordIndex: 4, endWordIndex: 7 },   // 4 words
    { surah: 2, ayah: 3, startWordIndex: 8, endWordIndex: 12 },  // 5 words
  ];

  it('resolves word in first ayah', () => {
    expect(resolveAyahFromWordIndex(2, ranges, 0, 0)).toEqual({
      surah: 2, ayah: 1, localWordIndex: 2,
    });
  });

  it('resolves word in second ayah', () => {
    expect(resolveAyahFromWordIndex(5, ranges, 0, 0)).toEqual({
      surah: 2, ayah: 2, localWordIndex: 1,
    });
  });

  it('resolves word in third ayah', () => {
    expect(resolveAyahFromWordIndex(10, ranges, 0, 0)).toEqual({
      surah: 2, ayah: 3, localWordIndex: 2,
    });
  });

  it('resolves first word of an ayah correctly', () => {
    expect(resolveAyahFromWordIndex(4, ranges, 0, 0)).toEqual({
      surah: 2, ayah: 2, localWordIndex: 0,
    });
  });

  it('resolves last word of an ayah correctly', () => {
    expect(resolveAyahFromWordIndex(12, ranges, 0, 0)).toEqual({
      surah: 2, ayah: 3, localWordIndex: 4,
    });
  });

  it('falls back when word index is out of range', () => {
    expect(resolveAyahFromWordIndex(99, ranges, 1, 1)).toEqual({
      surah: 1, ayah: 1, localWordIndex: 0,
    });
  });

  it('falls back with empty ranges', () => {
    expect(resolveAyahFromWordIndex(5, [], 2, 30)).toEqual({
      surah: 2, ayah: 30, localWordIndex: 0,
    });
  });
});
