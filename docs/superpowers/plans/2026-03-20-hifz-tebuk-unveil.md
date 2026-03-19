# Hifz Tebuk Quiz + Progressive Unveil — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two hifz exercise modes — Tebuk Quiz (3-round audio prompt recall) and Progressive Unveil (veiled page revealed word-by-word as student recites).

**Architecture:** Both features reuse the existing Tasmi' engine (`TasmiSession`, `SequenceMatcher`, `TalqinPlayer`) and quran-align word timestamps. A new `playRange()` method on `TalqinPlayer` enables playing exact word ranges. Shared `page-words.ts` utility provides ordered word lists and ayah range mapping. No new API routes or DB changes.

**Tech Stack:** Next.js 16, React 19, TypeScript 5, Vitest, ts-fsrs, Tailwind CSS 4, SVG masks

**Spec:** `docs/superpowers/specs/2026-03-20-hifz-tebuk-unveil-design.md`

---

## File Structure

### New Files

| File | Responsibility |
|------|----------------|
| `src/types/hifz-exercises.ts` | Shared types: `HifzFlow`, `TebukRoundResult`, `HifzExerciseResult` |
| `src/lib/hifz/page-words.ts` | `getPageWords()`, `buildAyahWordRanges()` — shared word ordering |
| `src/lib/hifz/tebuk.ts` | `pickTebukPrompts()` — prompt selection + continuation building |
| `src/lib/hifz/progressive-unveil.ts` | `buildUnveilState()`, `revealUpTo()` — immutable unveil state |
| `src/lib/hifz/page-words.test.ts` | Tests for page word ordering + ayah range builder |
| `src/lib/hifz/tebuk.test.ts` | Tests for tebuk prompt selection logic |
| `src/lib/hifz/progressive-unveil.test.ts` | Tests for unveil state management |
| `src/components/hifz/TebukPromptCard.tsx` | Renders 4-word QCF prompt with replay button |
| `src/components/hifz/TebukResultCard.tsx` | Per-round result display |
| `src/components/hifz/TebukSessionSummary.tsx` | Final 3-round aggregate summary |
| `src/components/hifz/HifzTebukSession.tsx` | Tebuk session orchestrator (state machine) |
| `src/components/hifz/VeilOverlay.tsx` | SVG veil with animated word reveals |
| `src/components/hifz/UnveilResultCard.tsx` | Unveil session result display |
| `src/components/hifz/HifzUnveilSession.tsx` | Unveil session orchestrator |

### Modified Files

| File | Change |
|------|--------|
| `src/lib/tasmi/talqin-player.ts` | Add `playRange()` method |
| `src/lib/hifz/sessionQueue.ts` | Extend `HifzFlowType` to include `'tebuk' \| 'unveil'` |
| `src/app/read/[page]/page.tsx` | Parse `?flow=tebuk` and `?flow=unveil` query params |
| `src/components/ReadPageWorkspace.tsx` | Route tebuk/unveil flows to new session components |

---

## Chunk 1: Shared Infrastructure

### Task 1: Shared Types

**Files:**
- Create: `src/types/hifz-exercises.ts`

- [ ] **Step 1: Create the types file**

```typescript
// src/types/hifz-exercises.ts
import type { TasmiSessionResult } from '@/lib/tasmi/tasmi-session';
import type { TasmiRatingLabel } from '@/lib/tasmi/fsrs-bridge';
import type { FsrsRating } from '@/types/database';

/** Supported hifz exercise flows (separate from HifzFlowType which covers memorize/review) */
export type HifzExerciseFlow = 'tebuk' | 'unveil';

/** A single word from a mushaf page in reading order */
export interface PageWord {
  location: string;       // "2:255:3" (surah:ayah:wordPos)
  surah: number;
  ayah: number;
  wordPosition: number;
  text: string;           // Uthmani text
  qpcV2: string;          // QCF glyph codepoint
}

/** Tebuk prompt: 4 words + continuation info */
export interface TebukPrompt {
  surah: number;
  ayah: number;
  startWordIdx: number;
  promptWords: PageWord[];
  continuationText: string;
  continuationAyahKeys: string[];
}

/** Result of a single tebuk round */
export interface TebukRoundResult {
  prompt: TebukPrompt;
  tasmiResult: TasmiSessionResult;
  rating: FsrsRating;
  label: TasmiRatingLabel;
}

/** Common session result shape for hifz exercises */
export interface HifzExerciseResult {
  flow: HifzExerciseFlow;
  pageNumber: number;
  rounds: TebukRoundResult[] | null;
  unveilResult: TasmiSessionResult | null;
  aggregateRating: FsrsRating;
  ayahRatings: Array<{
    ayahKey: string;
    ayah: number;
    rating: FsrsRating;
    label: TasmiRatingLabel;
  }>;
  durationSeconds: number;
}

/** Ayah word range for per-ayah FSRS scoring */
export interface AyahWordRange {
  surah: number;
  ayah: number;
  ayahKey: string;
  startWordIndex: number;
  endWordIndex: number;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit src/types/hifz-exercises.ts 2>&1 | head -20`
Expected: No errors (or only unrelated warnings)

- [ ] **Step 3: Commit**

```bash
git add src/types/hifz-exercises.ts
git commit -m "feat(hifz): add shared types for tebuk + unveil exercises"
```

---

### Task 2: Page Words Utility — Tests First

**Files:**
- Create: `src/lib/hifz/page-words.test.ts`
- Create: `src/lib/hifz/page-words.ts`

**Reference:** `src/types/mushafLayout.ts` for `MushafLayoutPage`, `MushafLayoutLine`, `MushafLayoutWord`

- [ ] **Step 1: Write failing tests**

```typescript
// src/lib/hifz/page-words.test.ts
import { describe, it, expect } from 'vitest';
import { getPageWords, buildAyahWordRanges } from './page-words';
import type { MushafLayoutPage } from '@/types/mushafLayout';

const MOCK_LAYOUT: MushafLayoutPage = {
  page: 2,
  lines: [
    { line: 1, type: 'surah-header', text: 'سورة البقرة', surah: '002' },
    { line: 2, type: 'basmala', qpcV2: 'ﭑﭒﭓ' },
    {
      line: 3,
      type: 'text',
      text: 'الٓمٓ ذَٰلِكَ ٱلْكِتَـٰبُ لَا رَيْبَ',
      verseRange: '2:1-2:2',
      words: [
        { location: '2:1:1', word: 'الٓمٓ', qpcV2: 'ﱁ' },
        { location: '2:2:1', word: 'ذَٰلِكَ', qpcV2: 'ﱃ' },
        { location: '2:2:2', word: 'ٱلْكِتَـٰبُ', qpcV2: 'ﱄ' },
        { location: '2:2:3', word: 'لَا', qpcV2: 'ﱅ' },
        { location: '2:2:4', word: 'رَيْبَ', qpcV2: 'ﱆ' },
      ],
    },
    {
      line: 4,
      type: 'text',
      text: 'فِيهِ هُدًۭى لِّلْمُتَّقِينَ',
      verseRange: '2:2',
      words: [
        { location: '2:2:5', word: 'فِيهِ', qpcV2: 'ﱈ' },
        { location: '2:2:6', word: 'هُدًۭى', qpcV2: 'ﱉ' },
        { location: '2:3:1', word: 'لِّلْمُتَّقِينَ', qpcV2: 'ﱊ' },
      ],
    },
  ],
};

describe('getPageWords', () => {
  it('returns words from text lines only, skipping surah-header and basmala', () => {
    const words = getPageWords(MOCK_LAYOUT);
    expect(words).toHaveLength(8);
    expect(words[0].location).toBe('2:1:1');
    expect(words[7].location).toBe('2:3:1');
  });

  it('parses surah, ayah, wordPosition from location string', () => {
    const words = getPageWords(MOCK_LAYOUT);
    expect(words[1]).toMatchObject({ surah: 2, ayah: 2, wordPosition: 1 });
    expect(words[7]).toMatchObject({ surah: 2, ayah: 3, wordPosition: 1 });
  });

  it('preserves text and qpcV2 from layout', () => {
    const words = getPageWords(MOCK_LAYOUT);
    expect(words[0].text).toBe('الٓمٓ');
    expect(words[0].qpcV2).toBe('ﱁ');
  });

  it('returns empty array for page with no text lines', () => {
    const emptyLayout: MushafLayoutPage = {
      page: 1,
      lines: [{ line: 1, type: 'surah-header', text: 'سورة الفاتحة', surah: '001' }],
    };
    expect(getPageWords(emptyLayout)).toEqual([]);
  });
});

describe('buildAyahWordRanges', () => {
  it('groups consecutive words by ayah with correct flat indices', () => {
    const words = getPageWords(MOCK_LAYOUT);
    const ranges = buildAyahWordRanges(words);

    expect(ranges).toHaveLength(3); // ayah 2:1, 2:2, 2:3
    expect(ranges[0]).toMatchObject({
      surah: 2, ayah: 1, ayahKey: '2:1',
      startWordIndex: 0, endWordIndex: 0,
    });
    expect(ranges[1]).toMatchObject({
      surah: 2, ayah: 2, ayahKey: '2:2',
      startWordIndex: 1, endWordIndex: 6,
    });
    expect(ranges[2]).toMatchObject({
      surah: 2, ayah: 3, ayahKey: '2:3',
      startWordIndex: 7, endWordIndex: 7,
    });
  });

  it('returns empty array for empty words', () => {
    expect(buildAyahWordRanges([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/hifz/page-words.test.ts 2>&1 | tail -10`
Expected: FAIL — module not found

- [ ] **Step 3: Implement page-words.ts**

```typescript
// src/lib/hifz/page-words.ts
import type { MushafLayoutPage } from '@/types/mushafLayout';
import type { PageWord, AyahWordRange } from '@/types/hifz-exercises';

/**
 * Parse a location string "surah:ayah:wordPos" into numeric components.
 */
function parseLocation(location: string): {
  surah: number;
  ayah: number;
  wordPosition: number;
} {
  const parts = location.split(':');
  return {
    surah: Number(parts[0]),
    ayah: Number(parts[1]),
    wordPosition: Number(parts[2]),
  };
}

/**
 * Get all words from a mushaf page in reading order.
 * Skips surah-header and basmala lines — returns only text line words.
 */
export function getPageWords(layout: MushafLayoutPage): PageWord[] {
  return layout.lines
    .filter((line) => line.type === 'text')
    .flatMap((line) =>
      (line.words ?? []).map((w) => {
        const parsed = parseLocation(w.location);
        return {
          location: w.location,
          surah: parsed.surah,
          ayah: parsed.ayah,
          wordPosition: parsed.wordPosition,
          text: w.word,
          qpcV2: w.qpcV2,
        };
      }),
    );
}

/**
 * Group page words into per-ayah ranges with flat indices.
 * Used by getPerAyahRatings() for per-ayah FSRS scoring.
 */
export function buildAyahWordRanges(words: PageWord[]): AyahWordRange[] {
  if (words.length === 0) return [];

  const ranges: AyahWordRange[] = [];
  let currentKey = `${words[0].surah}:${words[0].ayah}`;
  let startIndex = 0;

  for (let i = 1; i <= words.length; i++) {
    const nextKey =
      i < words.length ? `${words[i].surah}:${words[i].ayah}` : null;

    if (nextKey !== currentKey) {
      const w = words[startIndex];
      ranges.push({
        surah: w.surah,
        ayah: w.ayah,
        ayahKey: currentKey,
        startWordIndex: startIndex,
        endWordIndex: i - 1,
      });
      if (nextKey !== null) {
        currentKey = nextKey;
        startIndex = i;
      }
    }
  }

  return ranges;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/hifz/page-words.test.ts 2>&1 | tail -10`
Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/hifz/page-words.ts src/lib/hifz/page-words.test.ts
git commit -m "feat(hifz): add page-words utility with getPageWords + buildAyahWordRanges"
```

---

### Task 3: TalqinPlayer.playRange() — Tests First

**Files:**
- Modify: `src/lib/tasmi/talqin-player.ts`
- Create or extend: `src/lib/tasmi/talqin-player.test.ts`

**Reference:** Read existing `TalqinPlayer.play()` method in `src/lib/tasmi/talqin-player.ts` for the segment lookup pattern.

- [ ] **Step 1: Write failing tests**

```typescript
// src/lib/tasmi/talqin-player.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TalqinPlayer } from './talqin-player';

// Mock HTMLAudioElement
function mockAudio() {
  const listeners: Record<string, Function[]> = {};
  const audio = {
    currentTime: 0,
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    addEventListener: vi.fn((event: string, handler: Function, opts?: any) => {
      listeners[event] = [...(listeners[event] ?? []), handler];
    }),
    removeEventListener: vi.fn((event: string, handler: Function) => {
      listeners[event] = (listeners[event] ?? []).filter(h => h !== handler);
    }),
    _fireTimeUpdate: () => listeners['timeupdate']?.forEach(h => h()),
    _fireEnded: () => listeners['ended']?.forEach(h => h()),
  };
  vi.spyOn(globalThis, 'Audio').mockImplementation(() => audio as any);
  return audio;
}

describe('TalqinPlayer.playRange', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('seeks to startSegment.startMs and stops at endSegment.endMs', async () => {
    const onEnd = vi.fn();
    const player = new TalqinPlayer({ wordsToPlay: 5, onPlaybackEnd: onEnd });
    player.loadFromRawData([{
      surah: 2, ayah: 1,
      segments: [
        [0, 1, 0, 500],       // word 0: 0-500ms
        [1, 2, 500, 1200],    // word 1: 500-1200ms
        [2, 3, 1200, 1800],   // word 2: 1200-1800ms
        [3, 4, 1800, 2500],   // word 3: 1800-2500ms
      ],
    }]);

    const audio = mockAudio();
    await player.playRange(2, 1, 1, 3); // words 1-3

    expect(audio.currentTime).toBe(0.5); // 500ms
    expect(audio.play).toHaveBeenCalled();

    // Simulate time reaching endMs
    audio.currentTime = 2.5; // 2500ms
    audio._fireTimeUpdate();

    expect(onEnd).toHaveBeenCalled();
    expect(audio.pause).toHaveBeenCalled();
  });

  it('falls back to full ayah when no timestamp data', async () => {
    const onEnd = vi.fn();
    const player = new TalqinPlayer({ wordsToPlay: 5, onPlaybackEnd: onEnd });
    // No loadFromRawData — no timestamps

    const audio = mockAudio();
    await player.playRange(2, 1, 0, 3);

    expect(audio.currentTime).toBe(0); // No seeking
    expect(audio.play).toHaveBeenCalled();

    audio._fireEnded();
    expect(onEnd).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/tasmi/talqin-player.test.ts 2>&1 | tail -10`
Expected: FAIL — `playRange` is not a function

- [ ] **Step 3: Add playRange method to TalqinPlayer**

Add this method to the `TalqinPlayer` class in `src/lib/tasmi/talqin-player.ts`, after the existing `play()` method:

```typescript
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/tasmi/talqin-player.test.ts 2>&1 | tail -10`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/tasmi/talqin-player.ts src/lib/tasmi/talqin-player.test.ts
git commit -m "feat(tasmi): add TalqinPlayer.playRange() for word-range audio playback"
```

---

### Task 4: Route Setup — Flow Parsing + Label Constants

**Files:**
- Modify: `src/app/read/[page]/page.tsx` (lines 57-62)
- Create: `src/lib/hifz/exercise-labels.ts`

**Important:** Do NOT extend `HifzFlowType` in `sessionQueue.ts` — tebuk/unveil are exercise modes, not queue flow types. They don't use session queues. Handle the routing separately via query params.

- [ ] **Step 1: Create shared label constants (DRY)**

```typescript
// src/lib/hifz/exercise-labels.ts
import type { TasmiRatingLabel } from '@/lib/tasmi/fsrs-bridge';

export const RATING_LABEL_DISPLAY: Record<TasmiRatingLabel, { text: string; color: string }> = {
  ulang: { text: 'Ulang', color: 'text-red-600 dark:text-red-400' },
  tersangkut: { text: 'Tersangkut', color: 'text-amber-600 dark:text-amber-400' },
  lancar: { text: 'Lancar', color: 'text-teal-600 dark:text-teal-400' },
  mantap: { text: 'Mantap', color: 'text-emerald-600 dark:text-emerald-400' },
};
```

- [ ] **Step 2: Extend flow parsing in page.tsx**

In `src/app/read/[page]/page.tsx`, change lines 57-62. Note: `hifzFlow` remains typed as `HifzFlowType | null` for memorize/review. Add a separate `hifzExercise` variable:

```typescript
// After existing hifzFlow logic, add:
  const hifzExercise =
    query.flow === "tebuk"
      ? ("tebuk" as const)
      : query.flow === "unveil"
        ? ("unveil" as const)
        : null;
```

Pass `hifzExercise` as a new prop to `ReadPageWorkspace`. Also set `initialReadMode` to `"hifz"` when exercise is active.

- [ ] **Step 3: Add flow badges for tebuk/unveil in page.tsx**

In `src/app/read/[page]/page.tsx`, after the "Uji Hafalan" badge (line 103), add:

```tsx
            ) : hifzFlow === "tebuk" ? (
              <div className="inline-flex items-center rounded-full border border-purple-300 bg-purple-50 px-3 py-1 text-xs font-semibold tracking-wide text-purple-900 dark:border-purple-700/50 dark:bg-purple-900/30 dark:text-purple-100">
                Tebuk
              </div>
            ) : hifzFlow === "unveil" ? (
              <div className="inline-flex items-center rounded-full border border-rose-300 bg-rose-50 px-3 py-1 text-xs font-semibold tracking-wide text-rose-900 dark:border-rose-700/50 dark:bg-rose-900/30 dark:text-rose-100">
                Buka Tabir
              </div>
```

- [ ] **Step 4: Verify build compiles**

Run: `npm run build 2>&1 | tail -20`
Expected: Build succeeds (tebuk/unveil flows won't render anything yet — the components don't exist, but the types and routing work)

- [ ] **Step 5: Commit**

```bash
git add src/lib/hifz/sessionQueue.ts src/app/read/[page]/page.tsx
git commit -m "feat(hifz): extend HifzFlowType with tebuk + unveil flows"
```

---

## Chunk 2: Tebuk Quiz

### Task 5: Tebuk Prompt Selection — Tests First

**Files:**
- Create: `src/lib/hifz/tebuk.test.ts`
- Create: `src/lib/hifz/tebuk.ts`

**Reference:** Read `data/mushaf-layout/mushaf/page-002.json` for real layout structure. Read `src/lib/tasmi/arabic-normalizer.ts` for `normalizeArabic()`.

- [ ] **Step 1: Write failing tests**

```typescript
// src/lib/hifz/tebuk.test.ts
import { describe, it, expect } from 'vitest';
import { pickTebukPrompts } from './tebuk';
import type { MushafLayoutPage } from '@/types/mushafLayout';

// Page with 3 ayahs: ayah 2:1 (1 word — too short), 2:2 (6 words), 2:3 (5 words)
const MOCK_LAYOUT: MushafLayoutPage = {
  page: 2,
  lines: [
    { line: 1, type: 'surah-header', text: 'سورة البقرة', surah: '002' },
    { line: 2, type: 'basmala', qpcV2: 'ﭑﭒﭓ' },
    {
      line: 3, type: 'text', verseRange: '2:1-2:2',
      words: [
        { location: '2:1:1', word: 'الٓمٓ', qpcV2: 'ﱁ' },
        { location: '2:2:1', word: 'ذَٰلِكَ', qpcV2: 'ﱃ' },
        { location: '2:2:2', word: 'ٱلْكِتَـٰبُ', qpcV2: 'ﱄ' },
        { location: '2:2:3', word: 'لَا', qpcV2: 'ﱅ' },
        { location: '2:2:4', word: 'رَيْبَ', qpcV2: 'ﱆ' },
      ],
    },
    {
      line: 4, type: 'text', verseRange: '2:2-2:3',
      words: [
        { location: '2:2:5', word: 'فِيهِ', qpcV2: 'ﱈ' },
        { location: '2:2:6', word: 'هُدًۭى', qpcV2: 'ﱉ' },
        { location: '2:3:1', word: 'ٱلَّذِينَ', qpcV2: 'ﱊ' },
        { location: '2:3:2', word: 'يُؤْمِنُونَ', qpcV2: 'ﱋ' },
        { location: '2:3:3', word: 'بِٱلْغَيْبِ', qpcV2: 'ﱌ' },
        { location: '2:3:4', word: 'وَيُقِيمُونَ', qpcV2: 'ﱍ' },
        { location: '2:3:5', word: 'ٱلصَّلَوٰةَ', qpcV2: 'ﱎ' },
      ],
    },
  ],
};

describe('pickTebukPrompts', () => {
  it('returns prompts only from ayahs with >= 5 words', () => {
    const prompts = pickTebukPrompts(MOCK_LAYOUT, 3);
    // ayah 2:1 has 1 word — excluded. Only 2:2 (6 words) and 2:3 (5 words) qualify.
    expect(prompts.length).toBeLessThanOrEqual(2);
    expect(prompts.every(p => p.promptWords.length === 4)).toBe(true);
  });

  it('each prompt has 4 words', () => {
    const prompts = pickTebukPrompts(MOCK_LAYOUT, 2);
    for (const p of prompts) {
      expect(p.promptWords).toHaveLength(4);
    }
  });

  it('prompts come from different ayahs', () => {
    const prompts = pickTebukPrompts(MOCK_LAYOUT, 2);
    if (prompts.length >= 2) {
      const ayahKeys = prompts.map(p => `${p.surah}:${p.ayah}`);
      expect(new Set(ayahKeys).size).toBe(ayahKeys.length);
    }
  });

  it('continuation text is non-empty and capped at 20 words', () => {
    const prompts = pickTebukPrompts(MOCK_LAYOUT, 1);
    expect(prompts[0].continuationText.length).toBeGreaterThan(0);
    const wordCount = prompts[0].continuationText.split(' ').filter(w => w.length > 0).length;
    expect(wordCount).toBeLessThanOrEqual(20);
  });

  it('continuationAyahKeys includes the prompt ayah', () => {
    const prompts = pickTebukPrompts(MOCK_LAYOUT, 1);
    const key = `${prompts[0].surah}:${prompts[0].ayah}`;
    expect(prompts[0].continuationAyahKeys).toContain(key);
  });

  it('reduces count if page has fewer eligible ayahs', () => {
    // Request 3 but only 2 eligible ayahs
    const prompts = pickTebukPrompts(MOCK_LAYOUT, 3);
    expect(prompts.length).toBeLessThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/hifz/tebuk.test.ts 2>&1 | tail -10`
Expected: FAIL — module not found

- [ ] **Step 3: Implement tebuk.ts**

```typescript
// src/lib/hifz/tebuk.ts
import type { MushafLayoutPage } from '@/types/mushafLayout';
import type { TebukPrompt, PageWord } from '@/types/hifz-exercises';
import { getPageWords } from './page-words';
import { normalizeArabic } from '@/lib/tasmi/arabic-normalizer';

const PROMPT_WORD_COUNT = 4;
const MIN_AYAH_WORDS = 5;
const MAX_CONTINUATION_WORDS = 20;

interface AyahGroup {
  surah: number;
  ayah: number;
  words: PageWord[];
  startIndex: number; // flat index in page word list
}

function groupWordsByAyah(words: PageWord[]): AyahGroup[] {
  const groups: AyahGroup[] = [];
  let current: AyahGroup | null = null;

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const key = `${w.surah}:${w.ayah}`;
    const currentKey = current ? `${current.surah}:${current.ayah}` : null;

    if (key !== currentKey) {
      current = { surah: w.surah, ayah: w.ayah, words: [w], startIndex: i };
      groups.push(current);
    } else {
      current!.words = [...current!.words, w];
    }
  }

  return groups;
}

function shuffleArray<T>(arr: readonly T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Pick tebuk prompts from a mushaf page layout.
 * Each prompt: 4 words from a random position in an eligible ayah,
 * plus continuation text (rest of ayah + next ayah, capped at 20 words).
 */
export function pickTebukPrompts(
  layout: MushafLayoutPage,
  count: number,
): TebukPrompt[] {
  const allWords = getPageWords(layout);
  const groups = groupWordsByAyah(allWords);
  const eligible = groups.filter((g) => g.words.length >= MIN_AYAH_WORDS);

  const shuffled = shuffleArray(eligible);
  const selected = shuffled.slice(0, count);

  return selected.map((group) => {
    const maxStart = group.words.length - PROMPT_WORD_COUNT;
    const startIdx = Math.floor(Math.random() * (maxStart + 1));

    const promptWords = group.words.slice(startIdx, startIdx + PROMPT_WORD_COUNT);

    // Build continuation: rest of this ayah + subsequent ayahs on page
    const restOfAyah = group.words.slice(startIdx + PROMPT_WORD_COUNT);
    const groupIndex = groups.indexOf(group);
    const subsequentWords = groups
      .slice(groupIndex + 1)
      .flatMap((g) => g.words);

    const allContinuation = [...restOfAyah, ...subsequentWords];
    const cappedContinuation = allContinuation.slice(0, MAX_CONTINUATION_WORDS);

    const continuationText = normalizeArabic(
      cappedContinuation.map((w) => w.text).join(' '),
    );

    // Collect unique ayah keys in the continuation
    const continuationAyahKeys = [
      ...new Set(cappedContinuation.map((w) => `${w.surah}:${w.ayah}`)),
    ];
    // Always include the prompt ayah itself
    const promptAyahKey = `${group.surah}:${group.ayah}`;
    if (!continuationAyahKeys.includes(promptAyahKey)) {
      continuationAyahKeys.unshift(promptAyahKey);
    }

    return {
      surah: group.surah,
      ayah: group.ayah,
      startWordIdx: startIdx,
      promptWords,
      continuationText,
      continuationAyahKeys,
    };
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/hifz/tebuk.test.ts 2>&1 | tail -10`
Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/hifz/tebuk.ts src/lib/hifz/tebuk.test.ts
git commit -m "feat(hifz): add tebuk prompt selection with 4-word window + continuation"
```

---

### Task 6: Tebuk UI Components

**Files:**
- Create: `src/components/hifz/TebukPromptCard.tsx`
- Create: `src/components/hifz/TebukResultCard.tsx`
- Create: `src/components/hifz/TebukSessionSummary.tsx`

**Reference:** Read existing component patterns in `src/components/HifzInlineRating.tsx` and `src/components/HifzSessionComplete.tsx` for styling conventions (Tailwind classes, dark mode, BM labels).

- [ ] **Step 1: Create TebukPromptCard**

```typescript
// src/components/hifz/TebukPromptCard.tsx
'use client';

import type { TebukPrompt } from '@/types/hifz-exercises';

interface TebukPromptCardProps {
  prompt: TebukPrompt;
  pageNumber: number;
  roundNumber: number;
  totalRounds: number;
  isRevealed: boolean;
  onReplay: () => void;
}

export function TebukPromptCard({
  prompt,
  pageNumber,
  roundNumber,
  totalRounds,
  isRevealed,
  onReplay,
}: TebukPromptCardProps) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-700 dark:bg-stone-900">
      <div className="text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
        Tebuk {roundNumber}/{totalRounds}
      </div>

      {/* QCF V2 glyph display */}
      <div
        className="text-center leading-loose"
        style={{ fontFamily: `"QCF2 P${String(pageNumber).padStart(3, '0')}"` }}
        dir="rtl"
        lang="ar"
      >
        <span className="text-4xl sm:text-5xl">
          {prompt.promptWords.map((w) => w.qpcV2).join('')}
        </span>
      </div>

      {/* Replay button */}
      <button
        type="button"
        onClick={onReplay}
        className="inline-flex items-center gap-1.5 rounded-full border border-stone-300 bg-stone-50 px-3 py-1.5 text-xs font-medium text-stone-700 transition hover:bg-stone-100 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
        Ulang dengar
      </button>

      {/* Ayah reference — only shown after attempt */}
      {isRevealed && (
        <div className="text-sm text-stone-500 dark:text-stone-400">
          Surah {prompt.surah} : Ayat {prompt.ayah}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create TebukResultCard**

```typescript
// src/components/hifz/TebukResultCard.tsx
'use client';

import type { TebukRoundResult } from '@/types/hifz-exercises';

import { RATING_LABEL_DISPLAY } from '@/lib/hifz/exercise-labels';

interface TebukResultCardProps {
  result: TebukRoundResult;
  roundNumber: number;
  isLastRound: boolean;
  onNext: () => void;
}

export function TebukResultCard({
  result,
  roundNumber,
  isLastRound,
  onNext,
}: TebukResultCardProps) {
  const display = RATING_LABEL_DISPLAY[result.label] ?? RATING_LABEL_DISPLAY.ulang;
  const accuracy = Math.round(result.tasmiResult.accuracy);

  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-700 dark:bg-stone-900">
      <div className="text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
        Pusingan {roundNumber}
      </div>

      <div className={`text-2xl font-bold ${display.color}`}>
        {display.text}
      </div>

      <div className="flex gap-4 text-sm text-stone-600 dark:text-stone-400">
        <span>Ketepatan: {accuracy}%</span>
        <span>Talqin: {result.tasmiResult.talqinCount}</span>
      </div>

      <button
        type="button"
        onClick={onNext}
        className="mt-2 rounded-full bg-stone-900 px-5 py-2 text-sm font-semibold text-white transition hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-200"
      >
        {isLastRound ? 'Lihat Keputusan' : 'Seterusnya →'}
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Create TebukSessionSummary**

```typescript
// src/components/hifz/TebukSessionSummary.tsx
'use client';

import type { TebukRoundResult } from '@/types/hifz-exercises';
import type { TasmiRatingLabel } from '@/lib/tasmi/fsrs-bridge';

import { RATING_LABEL_DISPLAY } from '@/lib/hifz/exercise-labels';

interface TebukSessionSummaryProps {
  rounds: TebukRoundResult[];
  aggregateLabel: TasmiRatingLabel;
  pageNumber: number;
  onDone: () => void;
}

export function TebukSessionSummary({
  rounds,
  aggregateLabel,
  pageNumber,
  onDone,
}: TebukSessionSummaryProps) {
  const aggregate = RATING_LABEL_DISPLAY[aggregateLabel] ?? RATING_LABEL_DISPLAY.ulang;

  return (
    <div className="flex flex-col items-center gap-5 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-700 dark:bg-stone-900">
      <div className="text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
        Tebuk · Halaman {pageNumber}
      </div>

      <div className={`text-3xl font-bold ${aggregate.color}`}>
        {aggregate.text}
      </div>

      <div className="w-full space-y-2">
        {rounds.map((r, i) => {
          const d = RATING_LABEL_DISPLAY[r.label] ?? RATING_LABEL_DISPLAY.ulang;
          return (
            <div
              key={i}
              className="flex items-center justify-between rounded-lg bg-stone-50 px-4 py-2 text-sm dark:bg-stone-800"
            >
              <span className="text-stone-600 dark:text-stone-400">
                Pusingan {i + 1} · {r.prompt.surah}:{r.prompt.ayah}
              </span>
              <span className={`font-semibold ${d.color}`}>
                {Math.round(r.tasmiResult.accuracy)}% · {d.text}
              </span>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={onDone}
        className="mt-2 rounded-full bg-stone-900 px-5 py-2 text-sm font-semibold text-white transition hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-200"
      >
        Selesai
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Verify build compiles**

Run: `npm run build 2>&1 | tail -20`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add src/components/hifz/TebukPromptCard.tsx src/components/hifz/TebukResultCard.tsx src/components/hifz/TebukSessionSummary.tsx
git commit -m "feat(hifz): add tebuk UI components — prompt card, result card, session summary"
```

---

### Task 7: Tebuk Session Orchestrator

**Files:**
- Create: `src/components/hifz/HifzTebukSession.tsx`
- Modify: `src/components/ReadPageWorkspace.tsx` — wire tebuk flow

**Reference:** Read `src/components/HifzTasmiOverlay.tsx` for how `TasmiSession` and `TalqinPlayer` are wired in the existing review flow. Read `src/lib/tasmi/tasmi-session.ts` for event types. Read `src/lib/mushafLayout.ts` for how layout data is loaded.

- [ ] **Step 1: Create HifzTebukSession**

```typescript
// src/components/hifz/HifzTebukSession.tsx
'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import type { MushafLayoutPage } from '@/types/mushafLayout';
import type { TebukPrompt, TebukRoundResult } from '@/types/hifz-exercises';
import type { TasmiSessionResult, TasmiEvent } from '@/lib/tasmi/tasmi-session';
import { TasmiSession } from '@/lib/tasmi/tasmi-session';
import { TalqinPlayer } from '@/lib/tasmi/talqin-player';
import {
  tasmiResultToFsrsRating,
  tasmiResultToLabel,
} from '@/lib/tasmi/fsrs-bridge';
import { pickTebukPrompts } from '@/lib/hifz/tebuk';
import { TebukPromptCard } from './TebukPromptCard';
import { TebukResultCard } from './TebukResultCard';
import { TebukSessionSummary } from './TebukSessionSummary';

type TebukPhase = 'prompt' | 'playing' | 'reciting' | 'result' | 'complete';

interface HifzTebukSessionProps {
  layout: MushafLayoutPage;
  pageNumber: number;
  tasmiServerUrl: string;
  tasmiApiKey: string;
  alignData: unknown[];
  onComplete: (rounds: TebukRoundResult[]) => void;
  onExit: () => void;
}

export function HifzTebukSession({
  layout,
  pageNumber,
  tasmiServerUrl,
  tasmiApiKey,
  alignData,
  onComplete,
  onExit,
}: HifzTebukSessionProps) {
  const [prompts] = useState<TebukPrompt[]>(() =>
    pickTebukPrompts(layout, 3),
  );
  const [roundIndex, setRoundIndex] = useState(0);
  const [phase, setPhase] = useState<TebukPhase>('prompt');
  const [rounds, setRounds] = useState<TebukRoundResult[]>([]);
  const [currentResult, setCurrentResult] = useState<TasmiSessionResult | null>(null);

  const playerRef = useRef<TalqinPlayer | null>(null);
  const sessionRef = useRef<TasmiSession | null>(null);

  const currentPrompt = prompts[roundIndex] ?? null;

  // Initialize TalqinPlayer
  useEffect(() => {
    const player = new TalqinPlayer({
      wordsToPlay: 4,
      onPlaybackEnd: () => setPhase('reciting'),
    });
    player.loadFromRawData(alignData as any[]);
    playerRef.current = player;

    return () => {
      player.stop();
    };
  }, [alignData]);

  const playPromptAudio = useCallback(() => {
    if (!currentPrompt || !playerRef.current) return;
    setPhase('playing');
    void playerRef.current.playRange(
      currentPrompt.surah,
      currentPrompt.ayah,
      currentPrompt.startWordIdx,
      currentPrompt.startWordIdx + 3,
    );
  }, [currentPrompt]);

  // Start tasmi when entering reciting phase
  useEffect(() => {
    if (phase !== 'reciting' || !currentPrompt) return;

    const handleEvent = (event: TasmiEvent) => {
      if (event.type === 'session-end' && event.data?.result) {
        const result = event.data.result;
        setCurrentResult(result);
        setPhase('result');
      }
    };

    const session = new TasmiSession(
      currentPrompt.continuationText,
      {
        serverUrl: tasmiServerUrl,
        apiKey: tasmiApiKey,
        silenceThresholdSeconds: 6,
        errorThresholdCount: 2,
      },
      handleEvent,
    );
    sessionRef.current = session;
    session.start();

    return () => {
      session.end();
    };
  }, [phase, currentPrompt, tasmiServerUrl, tasmiApiKey]);

  const handleNextRound = useCallback(() => {
    if (!currentResult || !currentPrompt) return;

    const rating = tasmiResultToFsrsRating(currentResult);
    const label = tasmiResultToLabel(currentResult);
    const roundResult: TebukRoundResult = {
      prompt: currentPrompt,
      tasmiResult: currentResult,
      rating,
      label,
    };

    const updatedRounds = [...rounds, roundResult];
    setRounds(updatedRounds);
    setCurrentResult(null);

    if (roundIndex + 1 >= prompts.length) {
      setPhase('complete');
      onComplete(updatedRounds);
    } else {
      setRoundIndex(roundIndex + 1);
      setPhase('prompt');
    }
  }, [currentResult, currentPrompt, rounds, roundIndex, prompts.length, onComplete]);

  // Auto-play audio when entering prompt phase
  useEffect(() => {
    if (phase === 'prompt' && currentPrompt) {
      const timer = setTimeout(() => playPromptAudio(), 500);
      return () => clearTimeout(timer);
    }
  }, [phase, currentPrompt, playPromptAudio]);

  if (prompts.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-stone-200 bg-white p-6 dark:border-stone-700 dark:bg-stone-900">
        <p className="text-sm text-stone-600 dark:text-stone-400">
          Halaman ini tidak cukup ayat untuk tebuk.
        </p>
        <button type="button" onClick={onExit} className="text-sm font-medium text-stone-900 underline dark:text-stone-100">
          Kembali
        </button>
      </div>
    );
  }

  if (phase === 'complete') {
    const minLabel = rounds.reduce(
      (min, r) => (r.rating < (LABEL_DISPLAY_ORDER[min] ?? 5) ? r.label : min),
      rounds[0]?.label ?? 'ulang',
    );
    return (
      <TebukSessionSummary
        rounds={rounds}
        aggregateLabel={(() => {
          const minRating = Math.min(...rounds.map(r => r.rating));
          const match = rounds.find(r => r.rating === minRating);
          return match?.label ?? 'ulang';
        })()}
        pageNumber={pageNumber}
        onDone={onExit}
      />
    );
  }

  if (phase === 'result' && currentResult && currentPrompt) {
    const rating = tasmiResultToFsrsRating(currentResult);
    const label = tasmiResultToLabel(currentResult);
    return (
      <TebukResultCard
        result={{ prompt: currentPrompt, tasmiResult: currentResult, rating, label }}
        roundNumber={roundIndex + 1}
        isLastRound={roundIndex + 1 >= prompts.length}
        onNext={handleNextRound}
      />
    );
  }

  if (!currentPrompt) return null;

  return (
    <div className="flex flex-col items-center gap-4">
      <TebukPromptCard
        prompt={currentPrompt}
        pageNumber={pageNumber}
        roundNumber={roundIndex + 1}
        totalRounds={prompts.length}
        isRevealed={phase === 'result'}
        onReplay={playPromptAudio}
      />

      {phase === 'playing' && (
        <div className="text-sm text-stone-500 animate-pulse dark:text-stone-400">
          Mendengar...
        </div>
      )}

      {phase === 'reciting' && (
        <div className="text-sm font-medium text-teal-600 animate-pulse dark:text-teal-400">
          Sambung bacaan...
        </div>
      )}
    </div>
  );
}
```

**Critical integration notes:**

1. **VAD / Microphone recording:** The above snippet does NOT include VAD/recorder setup. `TasmiSession.processAudioChunk()` requires audio blobs from a VAD pipeline. Before implementing this component, READ `src/components/HifzTasmiOverlay.tsx` to understand how `TasmiRecorder` (VAD) is created, how `onSpeechEnd` feeds blobs to `session.processAudioChunk()`, and how `onSilenceTimeout` wires to `session.onSilenceTimeout()`. Replicate that pattern here. The VAD setup goes in the `phase === 'reciting'` effect.

2. **Talqin handling:** When `TasmiSession` emits a `talqin` event, pause the recorder, play talqin audio via `TalqinPlayer.play()`, then resume the recorder on `onPlaybackEnd`. Same pattern as `HifzTasmiOverlay.tsx`.

3. **Error handling:** If VAD fails to initialize (e.g., mic permission denied), show an error message and an exit button. Don't crash.

4. **Remove dead code:** The `LABEL_DISPLAY_ORDER` reference in the `complete` phase is dead code — the IIFE below it computes the aggregate label correctly. Remove the `LABEL_DISPLAY_ORDER` block entirely.

- [ ] **Step 2: Wire into ReadPageWorkspace**

In `src/components/ReadPageWorkspace.tsx`, add the import and conditional render block for `hifzFlow === "tebuk"`. Look at how `hifzFlow === "review"` is handled (around line 953) and add a similar block:

```tsx
// Import at top:
import { HifzTebukSession } from '@/components/hifz/HifzTebukSession';

// In the render, after the memorize block (~line 978+), add:
      {hifzFlow === "tebuk" && (
        <HifzTebukSession
          layout={layout}
          pageNumber={pageNumber}
          tasmiServerUrl={process.env.NEXT_PUBLIC_TASMI_SERVER_URL ?? ''}
          tasmiApiKey={process.env.NEXT_PUBLIC_TASMI_API_KEY ?? ''}
          alignData={[]} // TODO: Load from quran-align-alafasy.json
          onComplete={(rounds) => {
            // TODO: Call /api/hifz/rate-batch with aggregate ratings
            console.log('Tebuk complete:', rounds);
          }}
          onExit={() => {
            // Navigate back to page without flow param
            router.push(`/read/${pageNumber}`);
          }}
        />
      )}
```

- [ ] **Step 3: Verify build compiles**

Run: `npm run build 2>&1 | tail -20`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/components/hifz/HifzTebukSession.tsx src/components/ReadPageWorkspace.tsx
git commit -m "feat(hifz): add tebuk session orchestrator + wire into ReadPageWorkspace"
```

---

## Chunk 3: Progressive Unveil

### Task 8: Unveil State Management — Tests First

**Files:**
- Create: `src/lib/hifz/progressive-unveil.test.ts`
- Create: `src/lib/hifz/progressive-unveil.ts`

**Reference:** `src/types/mushaf.ts` for `MushafPageManifest` and `MushafWordHitbox`.

- [ ] **Step 1: Write failing tests**

```typescript
// src/lib/hifz/progressive-unveil.test.ts
import { describe, it, expect } from 'vitest';
import { buildUnveilState, revealUpTo } from './progressive-unveil';
import type { MushafLayoutPage } from '@/types/mushafLayout';
import type { MushafPageManifest } from '@/types/mushaf';

const MOCK_LAYOUT: MushafLayoutPage = {
  page: 2,
  lines: [
    { line: 1, type: 'surah-header', text: 'سورة البقرة', surah: '002' },
    {
      line: 2, type: 'text', verseRange: '2:1',
      words: [
        { location: '2:1:1', word: 'الٓمٓ', qpcV2: 'ﱁ' },
      ],
    },
    {
      line: 3, type: 'text', verseRange: '2:2',
      words: [
        { location: '2:2:1', word: 'ذَٰلِكَ', qpcV2: 'ﱃ' },
        { location: '2:2:2', word: 'ٱلْكِتَـٰبُ', qpcV2: 'ﱄ' },
      ],
    },
  ],
};

const MOCK_MANIFEST: MushafPageManifest = {
  page: 2,
  schema_version: '1.0',
  image_width: 1200,
  image_height: 1800,
  words: [
    { location: '2:1:1', x: 900, y: 100, width: 200, height: 60 },
    { location: '2:2:1', x: 800, y: 200, width: 180, height: 60 },
    { location: '2:2:2', x: 600, y: 200, width: 190, height: 60 },
    // '2:2:3' intentionally missing — tests graceful degradation
  ],
};

describe('buildUnveilState', () => {
  it('creates state with correct word count (only words with hitboxes)', () => {
    const state = buildUnveilState(MOCK_LAYOUT, MOCK_MANIFEST);
    expect(state.totalWords).toBe(3); // 3 words have matching hitboxes
    expect(state.words).toHaveLength(3);
    expect(state.revealedUpTo).toBe(-1); // all veiled
  });

  it('preserves reading order', () => {
    const state = buildUnveilState(MOCK_LAYOUT, MOCK_MANIFEST);
    expect(state.words[0].location).toBe('2:1:1');
    expect(state.words[1].location).toBe('2:2:1');
    expect(state.words[2].location).toBe('2:2:2');
  });

  it('includes surah/ayah/wordPosition for reverse mapping', () => {
    const state = buildUnveilState(MOCK_LAYOUT, MOCK_MANIFEST);
    expect(state.words[0]).toMatchObject({ surah: 2, ayah: 1, wordPosition: 1 });
  });

  it('skips words without manifest hitbox (graceful degradation)', () => {
    const layoutWithExtra: MushafLayoutPage = {
      ...MOCK_LAYOUT,
      lines: [
        ...MOCK_LAYOUT.lines,
        {
          line: 4, type: 'text', verseRange: '2:2',
          words: [{ location: '2:2:3', word: 'لَا', qpcV2: 'ﱅ' }],
        },
      ],
    };
    // '2:2:3' has no hitbox in manifest
    const state = buildUnveilState(layoutWithExtra, MOCK_MANIFEST);
    expect(state.totalWords).toBe(3); // Still 3 — '2:2:3' skipped
  });
});

describe('revealUpTo', () => {
  it('returns a new state object (immutability)', () => {
    const state = buildUnveilState(MOCK_LAYOUT, MOCK_MANIFEST);
    const revealed = revealUpTo(state, 1);
    expect(revealed).not.toBe(state);
    expect(state.revealedUpTo).toBe(-1); // original unchanged
  });

  it('updates revealedUpTo correctly', () => {
    const state = buildUnveilState(MOCK_LAYOUT, MOCK_MANIFEST);
    const revealed = revealUpTo(state, 2);
    expect(revealed.revealedUpTo).toBe(2);
  });

  it('never goes backwards', () => {
    const state = buildUnveilState(MOCK_LAYOUT, MOCK_MANIFEST);
    const r1 = revealUpTo(state, 2);
    const r2 = revealUpTo(r1, 1); // Attempt to go back
    expect(r2.revealedUpTo).toBe(2); // stays at 2
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/hifz/progressive-unveil.test.ts 2>&1 | tail -10`
Expected: FAIL — module not found

- [ ] **Step 3: Implement progressive-unveil.ts**

```typescript
// src/lib/hifz/progressive-unveil.ts
import type { MushafLayoutPage } from '@/types/mushafLayout';
import type { MushafPageManifest, MushafWordHitbox } from '@/types/mushaf';
import { getPageWords } from './page-words';

export interface UnveilWord {
  index: number;
  location: string;
  surah: number;
  ayah: number;
  wordPosition: number;
  hitbox: MushafWordHitbox;
}

export interface UnveilState {
  words: UnveilWord[];
  revealedUpTo: number;
  totalWords: number;
}

/**
 * Build initial unveil state by joining page words with manifest hitboxes.
 * Words without a matching hitbox are silently skipped.
 */
export function buildUnveilState(
  layout: MushafLayoutPage,
  manifest: MushafPageManifest,
): UnveilState {
  const pageWords = getPageWords(layout);
  const hitboxMap = new Map(
    manifest.words.map((w) => [w.location, w]),
  );

  let index = 0;
  const words: UnveilWord[] = [];

  for (const pw of pageWords) {
    const hitbox = hitboxMap.get(pw.location);
    if (!hitbox) continue;

    words.push({
      index,
      location: pw.location,
      surah: pw.surah,
      ayah: pw.ayah,
      wordPosition: pw.wordPosition,
      hitbox,
    });
    index++;
  }

  return {
    words,
    revealedUpTo: -1,
    totalWords: words.length,
  };
}

/**
 * Reveal words up to the given index.
 * Returns a new state (immutable). Never goes backwards.
 */
export function revealUpTo(
  state: UnveilState,
  wordIndex: number,
): UnveilState {
  const clampedIndex = Math.max(state.revealedUpTo, wordIndex);
  return {
    ...state,
    revealedUpTo: clampedIndex,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/hifz/progressive-unveil.test.ts 2>&1 | tail -10`
Expected: All 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/hifz/progressive-unveil.ts src/lib/hifz/progressive-unveil.test.ts
git commit -m "feat(hifz): add progressive-unveil state management with immutable revealUpTo"
```

---

### Task 9: VeilOverlay Component

**Files:**
- Create: `src/components/hifz/VeilOverlay.tsx`

- [ ] **Step 1: Create VeilOverlay**

```typescript
// src/components/hifz/VeilOverlay.tsx
'use client';

import type { UnveilWord } from '@/lib/hifz/progressive-unveil';

const HITBOX_PADDING = 2;
const VEIL_COLOR = '#f5f0e8';

interface VeilOverlayProps {
  words: UnveilWord[];
  revealedUpTo: number;
  imageWidth: number;
  imageHeight: number;
}

export function VeilOverlay({
  words,
  revealedUpTo,
  imageWidth,
  imageHeight,
}: VeilOverlayProps) {
  return (
    <svg
      viewBox={`0 0 ${imageWidth} ${imageHeight}`}
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden="true"
    >
      <defs>
        <style>{`
          .veil-word { transition: opacity 200ms ease-out; }
          @media (prefers-reduced-motion: reduce) {
            .veil-word { transition: none; }
          }
        `}</style>
        <mask id="page-veil">
          {/* White = veiled, black cutouts = revealed */}
          <rect fill="white" width="100%" height="100%" />
          {words.map((word) => (
            <rect
              key={word.location}
              className="veil-word"
              fill="black"
              opacity={word.index <= revealedUpTo ? 1 : 0}
              x={word.hitbox.x - HITBOX_PADDING}
              y={word.hitbox.y - HITBOX_PADDING}
              width={word.hitbox.width + HITBOX_PADDING * 2}
              height={word.hitbox.height + HITBOX_PADDING * 2}
            />
          ))}
        </mask>
      </defs>
      <rect
        fill={VEIL_COLOR}
        mask="url(#page-veil)"
        width="100%"
        height="100%"
      />
    </svg>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build 2>&1 | tail -20`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/components/hifz/VeilOverlay.tsx
git commit -m "feat(hifz): add VeilOverlay SVG component with animated word reveals"
```

---

### Task 10: Unveil Session Orchestrator + Wiring

**Files:**
- Create: `src/components/hifz/UnveilResultCard.tsx`
- Create: `src/components/hifz/HifzUnveilSession.tsx`
- Modify: `src/components/ReadPageWorkspace.tsx` — wire unveil flow

**Reference:** Same integration pattern as Task 7 (tebuk session). Read `src/lib/tasmi/fsrs-bridge.ts` for `getPerAyahRatings()`.

- [ ] **Step 1: Create UnveilResultCard**

```typescript
// src/components/hifz/UnveilResultCard.tsx
'use client';

import type { TasmiSessionResult } from '@/lib/tasmi/tasmi-session';
import type { TasmiRatingLabel } from '@/lib/tasmi/fsrs-bridge';
import type { FsrsRating } from '@/types/database';

import { RATING_LABEL_DISPLAY } from '@/lib/hifz/exercise-labels';

interface AyahRating {
  ayahKey: string;
  rating: FsrsRating;
  label: TasmiRatingLabel;
}

interface UnveilResultCardProps {
  result: TasmiSessionResult;
  label: TasmiRatingLabel;
  ayahRatings: AyahRating[];
  pageNumber: number;
  onDone: () => void;
}

export function UnveilResultCard({
  result,
  label,
  ayahRatings,
  pageNumber,
  onDone,
}: UnveilResultCardProps) {
  const display = RATING_LABEL_DISPLAY[label] ?? RATING_LABEL_DISPLAY.ulang;
  const minutes = Math.floor(result.durationSeconds / 60);
  const seconds = Math.round(result.durationSeconds % 60);

  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-700 dark:bg-stone-900">
      <div className="text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
        Buka Tabir · Halaman {pageNumber}
      </div>

      <div className={`text-3xl font-bold ${display.color}`}>
        {display.text}
      </div>

      <div className="flex gap-4 text-sm text-stone-600 dark:text-stone-400">
        <span>Ketepatan: {Math.round(result.accuracy)}%</span>
        <span>Talqin: {result.talqinCount}</span>
        <span>{minutes}:{String(seconds).padStart(2, '0')}</span>
      </div>

      {ayahRatings.length > 0 && (
        <div className="w-full space-y-1">
          <div className="text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
            Setiap Ayat
          </div>
          {ayahRatings.map((ar) => {
            const d = RATING_LABEL_DISPLAY[ar.label] ?? RATING_LABEL_DISPLAY.ulang;
            return (
              <div
                key={ar.ayahKey}
                className="flex items-center justify-between rounded-lg bg-stone-50 px-3 py-1.5 text-sm dark:bg-stone-800"
              >
                <span className="text-stone-600 dark:text-stone-400">
                  Ayat {ar.ayahKey}
                </span>
                <span className={`font-semibold ${d.color}`}>{d.text}</span>
              </div>
            );
          })}
        </div>
      )}

      <button
        type="button"
        onClick={onDone}
        className="mt-2 rounded-full bg-stone-900 px-5 py-2 text-sm font-semibold text-white transition hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-200"
      >
        Selesai
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Create HifzUnveilSession**

```typescript
// src/components/hifz/HifzUnveilSession.tsx
'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import type { MushafLayoutPage } from '@/types/mushafLayout';
import type { MushafPageManifest } from '@/types/mushaf';
import type { TasmiEvent, TasmiSessionResult } from '@/lib/tasmi/tasmi-session';
import { TasmiSession } from '@/lib/tasmi/tasmi-session';
import { TalqinPlayer } from '@/lib/tasmi/talqin-player';
import {
  tasmiResultToLabel,
  tasmiResultToFsrsRating,
  getPerAyahRatings,
} from '@/lib/tasmi/fsrs-bridge';
import {
  buildUnveilState,
  revealUpTo,
  type UnveilState,
} from '@/lib/hifz/progressive-unveil';
import { getPageWords, buildAyahWordRanges } from '@/lib/hifz/page-words';
import { normalizeArabic } from '@/lib/tasmi/arabic-normalizer';
import { VeilOverlay } from './VeilOverlay';
import { UnveilResultCard } from './UnveilResultCard';

type UnveilPhase = 'prompting' | 'reciting' | 'complete';

interface HifzUnveilSessionProps {
  layout: MushafLayoutPage;
  manifest: MushafPageManifest;
  pageNumber: number;
  tasmiServerUrl: string;
  tasmiApiKey: string;
  alignData: unknown[];
  /** The page image element ref — VeilOverlay is positioned over this */
  children: React.ReactNode;
  onComplete: () => void;
  onExit: () => void;
}

export function HifzUnveilSession({
  layout,
  manifest,
  pageNumber,
  tasmiServerUrl,
  tasmiApiKey,
  alignData,
  children,
  onComplete,
  onExit,
}: HifzUnveilSessionProps) {
  const [unveilState, setUnveilState] = useState<UnveilState>(() =>
    buildUnveilState(layout, manifest),
  );
  const [phase, setPhase] = useState<UnveilPhase>('prompting');
  const [result, setResult] = useState<TasmiSessionResult | null>(null);

  const playerRef = useRef<TalqinPlayer | null>(null);
  const sessionRef = useRef<TasmiSession | null>(null);

  const pageWords = getPageWords(layout);
  const ayahRanges = buildAyahWordRanges(pageWords);
  const expectedText = normalizeArabic(
    pageWords.map((w) => w.text).join(' '),
  );

  // Initialize TalqinPlayer
  useEffect(() => {
    const player = new TalqinPlayer({
      wordsToPlay: 5,
      onPlaybackEnd: () => setPhase('reciting'),
    });
    player.loadFromRawData(alignData as any[]);
    playerRef.current = player;
    return () => player.stop();
  }, [alignData]);

  // Play initial prompt (first 3 words of first ayah)
  useEffect(() => {
    if (phase !== 'prompting' || !playerRef.current || pageWords.length === 0) return;

    const first = pageWords[0];
    void playerRef.current.playRange(
      first.surah,
      first.ayah,
      first.wordPosition,
      Math.min(first.wordPosition + 2, pageWords.length - 1),
    );
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // Start TasmiSession when reciting
  useEffect(() => {
    if (phase !== 'reciting') return;

    const handleEvent = (event: TasmiEvent) => {
      if (event.type === 'match' && event.data?.matchResult) {
        const idx = event.data.matchResult.lastCorrectIndex;
        setUnveilState((prev) => revealUpTo(prev, idx));
      }

      if (event.type === 'talqin' && event.data?.talqinWordIndex != null) {
        const wordIdx = event.data.talqinWordIndex;
        const word = unveilState.words[wordIdx];
        if (word && playerRef.current) {
          void playerRef.current.play(word.surah, word.ayah, word.wordPosition);
        }
      }

      if (event.type === 'session-end' && event.data?.result) {
        setResult(event.data.result);
        // Reveal all words
        setUnveilState((prev) => revealUpTo(prev, prev.totalWords - 1));
        setPhase('complete');
        onComplete();
      }
    };

    const session = new TasmiSession(expectedText, {
      serverUrl: tasmiServerUrl,
      apiKey: tasmiApiKey,
      silenceThresholdSeconds: 6,
      errorThresholdCount: 2,
    }, handleEvent);
    sessionRef.current = session;
    session.start();

    return () => session.end();
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  if (phase === 'complete' && result) {
    const label = tasmiResultToLabel(result);
    const perAyah = getPerAyahRatings(
      result,
      ayahRanges.map((r) => ({
        ayah: r.ayah,
        startWordIndex: r.startWordIndex,
        endWordIndex: r.endWordIndex,
      })),
    );
    const ayahRatings = perAyah.map((pa, i) => ({
      ayahKey: ayahRanges[i].ayahKey,
      rating: pa.rating,
      label: pa.label,
    }));

    return (
      <UnveilResultCard
        result={result}
        label={label}
        ayahRatings={ayahRatings}
        pageNumber={pageNumber}
        onDone={onExit}
      />
    );
  }

  return (
    <div className="relative">
      {children}
      <VeilOverlay
        words={unveilState.words}
        revealedUpTo={unveilState.revealedUpTo}
        imageWidth={manifest.image_width}
        imageHeight={manifest.image_height}
      />

      {phase === 'prompting' && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-4 py-2 text-sm font-medium text-white">
          Mendengar bacaan pembuka...
        </div>
      )}

      {phase === 'reciting' && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-teal-600/80 px-4 py-2 text-sm font-medium text-white animate-pulse">
          Sambung bacaan dari hafalan...
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Wire into ReadPageWorkspace**

In `src/components/ReadPageWorkspace.tsx`, add import and render block for `hifzFlow === "unveil"`. Follow the same pattern as the tebuk wiring (Task 7):

```tsx
// Import at top:
import { HifzUnveilSession } from '@/components/hifz/HifzUnveilSession';

// In the render, after the tebuk block, add:
      {hifzFlow === "unveil" && manifest && (
        <HifzUnveilSession
          layout={layout}
          manifest={manifest}
          pageNumber={pageNumber}
          tasmiServerUrl={process.env.NEXT_PUBLIC_TASMI_SERVER_URL ?? ''}
          tasmiApiKey={process.env.NEXT_PUBLIC_TASMI_API_KEY ?? ''}
          alignData={[]} // TODO: Load from quran-align-alafasy.json
          onComplete={() => {
            // TODO: Call /api/hifz/rate-batch
            console.log('Unveil complete');
          }}
          onExit={() => router.push(`/read/${pageNumber}`)}
        >
          {/* Page image goes here — existing MushafPageView */}
        </HifzUnveilSession>
      )}
```

Note: The `manifest` and `alignData` loading will need to be wired from existing data loaders. Check how manifests are loaded in the current page view and replicate.

- [ ] **Step 4: Verify build compiles**

Run: `npm run build 2>&1 | tail -20`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add src/components/hifz/UnveilResultCard.tsx src/components/hifz/HifzUnveilSession.tsx src/components/ReadPageWorkspace.tsx
git commit -m "feat(hifz): add progressive unveil session orchestrator + wire into workspace"
```

---

## Chunk 4: Integration + Final Verification

### Task 11: Wire Data Loading (alignData + manifest)

**Files:**
- Modify: `src/components/ReadPageWorkspace.tsx`
- Possibly modify: `src/lib/readPageData.ts` or wherever page data is loaded

**Reference:** Read how `quran-align-alafasy.json` is currently loaded by `TalqinPlayer` in `HifzTasmiOverlay.tsx`. Read how manifests are loaded via `mushafAssets.ts`.

- [ ] **Step 1: Load quran-align data for the current page**

Find how `HifzTasmiOverlay.tsx` loads the align data (likely via a `fetch('/data/quran-align-alafasy.json')` or a filtered subset). Replicate this in `ReadPageWorkspace` so it's available to both tebuk and unveil sessions. Store as state, filter to only the ayahs on the current page.

- [ ] **Step 2: Load page manifest for unveil**

Use existing `loadManifest()` from `mushafAssets.ts` to load `page_NNN.manifest.json`. Store in state. Pass to `HifzUnveilSession`.

- [ ] **Step 3: Replace `alignData={[]}` TODOs with actual data**

Update both tebuk and unveil wiring blocks to pass the loaded data instead of empty arrays.

- [ ] **Step 4: Wire FSRS rate-batch calls**

Replace `console.log('Tebuk complete')` and `console.log('Unveil complete')` with actual `fetch('/api/hifz/rate-batch', ...)` calls. Use `buildAyahWordRanges()` + `getPerAyahRatings()` to compute per-ayah ratings.

- [ ] **Step 5: Fix wordPosition 0-based/1-based**

In `HifzUnveilSession`, the initial prompt uses `first.wordPosition` from the location string (1-based). `playRange` expects 0-based indices matching quran-align segments. Fix: use `first.wordPosition - 1` or map through the ayah's segment data.

- [ ] **Step 6: Fix unveil talqin index mapping**

The `talqinWordIndex` from `TasmiSession` is a flat index into the concatenated expected text. But `unveilState.words` may have gaps (words without hitboxes are skipped). Build a separate mapping array from flat text index → surah:ayah:wordPosition using `getPageWords()` (which includes all words, not just those with hitboxes).

- [ ] **Step 7: Verify build**

Run: `npm run build 2>&1 | tail -20`
Expected: Build succeeds

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(hifz): wire align data, manifest loading, FSRS rate-batch for tebuk + unveil"
```

---

### Task 12: Run Full Test Suite + Build

- [ ] **Step 1: Run all hifz + tasmi tests**

Run: `npx vitest run src/lib/hifz/ src/lib/tasmi/ 2>&1 | tail -30`
Expected: All tests PASS

- [ ] **Step 2: Run full build**

Run: `npm run build 2>&1 | tail -20`
Expected: Build succeeds with no errors

- [ ] **Step 3: Commit any fixes**

If any tests or build issues were found, fix and commit:

```bash
git add -A
git commit -m "fix(hifz): resolve test/build issues from integration"
```

---

### Task 13: Final Commit + Summary

- [ ] **Step 1: Verify git status is clean**

Run: `git status`
Expected: Clean working tree

- [ ] **Step 2: Review commit history**

Run: `git log --oneline -10`
Expected: ~8 focused commits covering types → page-words → playRange → flow types → tebuk logic → tebuk UI → unveil logic → unveil UI
