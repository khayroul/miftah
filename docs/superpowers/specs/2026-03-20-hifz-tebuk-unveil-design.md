# Hifz Features: Tebuk Quiz + Progressive Unveil

**Date:** 2026-03-20
**Status:** Design
**Author:** Claude + Khairul

## Overview

Two new hifz features that test memorization recall using the existing Tasmi' engine and quran-align word timestamps (Approach A).

1. **Tebuk Quiz** — Play a 4-word audio snippet from a random ayah on a page. Student continues reciting from memory. 3 rounds per session.
2. **Progressive Unveil** — A veiled mushaf page reveals word-by-word as the student recites correctly from memory.

Both features reuse `TasmiSession`, `SequenceMatcher`, `TalqinPlayer`, `fsrs-bridge`, and `quran-align-alafasy.json`. No new external dependencies.

---

## Shared Infrastructure

### Word-Range Audio Playback

`TalqinPlayer` already seeks to a word position and plays N words forward. We add a dedicated method for playing an exact word range:

```typescript
// New method on TalqinPlayer
async playRange(
  surah: number,
  ayah: number,
  startWordIdx: number,
  endWordIdx: number,
): Promise<void>
```

- Loads the ayah audio from EveryAyah
- Finds the start segment via `segments.find(s => startWordIdx >= s.startWord && startWordIdx < s.endWord)` (same pattern as existing `play()` method — segments can span multiple words)
- Finds the end segment via `segments.find(s => endWordIdx >= s.startWord && endWordIdx < s.endWord)`
- Seeks to `startSegment.startMs`, stops at `endSegment.endMs`
- Fires `onPlaybackEnd` callback when range completes
- Falls back to full ayah if timestamp data is missing

This is a thin wrapper over existing `play()` logic — same audio element, same timeupdate listener pattern, but with explicit start/end word indices instead of `wordIndex + wordsToPlay`.

### TasmiSession: Per-Word Progress Callback

Currently `TasmiSession` emits coarse events (`match`, `error`). Both features need per-word granularity for UI updates. The `match` event already includes `data.progress` (0-1 float) and `data.matchResult.lastCorrectIndex`. No new events needed — consumers read `lastCorrectIndex` from the match result to drive word-level UI.

### Page Word Ordering

Both features need words from a page in reading order. `MushafLayoutPage` provides `lines[].words[]` in top-to-bottom, right-to-left order. We build a flat ordered word list:

```typescript
interface PageWord {
  location: string;       // "2:255:3" (surah:ayah:wordPos)
  surah: number;
  ayah: number;
  wordPosition: number;
  text: string;           // Uthmani text
  qpcV2: string;          // QCF glyph codepoint
}

function getPageWords(layout: MushafLayoutPage): PageWord[]
```

Filters out `surah-header` and `basmala` line types. Returns only `text` lines' words.

---

## Feature 1: Tebuk Quiz

### Concept

The traditional tebuk test: a teacher reads a few words from somewhere in a page, then stops. The student must identify the location and continue reciting from memory.

### Session Flow

```
pickTebukPrompts(pageNumber, 3)
  → Round 1:
      1. Display 4-word prompt (QCF glyphs, no surah:ayah label)
      2. Play audio of those 4 words via TalqinPlayer.playRange()
      3. audio.onPlaybackEnd → TasmiSession.start()
      4. Student recites continuation from memory
      5. TasmiSession evaluates → TasmiSessionResult
      6. Show result (accuracy, errors) + reveal ayah reference
  → Round 2: (same flow, different ayah)
  → Round 3: (same flow, different ayah)
  → Session complete: aggregate score, rate via FSRS
```

### Core Logic: `src/lib/hifz/tebuk.ts`

```typescript
interface TebukPrompt {
  /** Which ayah this prompt comes from */
  surah: number;
  ayah: number;
  /** 0-based start index within the ayah */
  startWordIdx: number;
  /** The 4 prompt words (QCF glyphs + text) */
  promptWords: PageWord[];
  /** Plain text of the continuation (rest of ayah + next ayah on page) */
  continuationText: string;
  /** Ayah keys included in the continuation, for FSRS rating */
  continuationAyahKeys: string[];
}

function pickTebukPrompts(
  layout: MushafLayoutPage,
  count: number,
): TebukPrompt[]
```

**Selection rules:**
- Only from `text` lines (skip `surah-header`, `basmala`)
- Ayah must have >= 5 words (need 4 for prompt + at least 1 for continuation)
- All prompts from different ayahs
- Random 4-word window within each ayah: `startIdx = random(0, wordCount - 4)`
- If page has fewer eligible ayahs than `count`, reduce round count

**Continuation text:**
- Rest of the prompt ayah (words after the 4-word window)
- Plus the next 1-2 ayahs on the same page (if available)
- Concatenated, normalized via `normalizeArabic()` for the `SequenceMatcher`
- Gives the student enough runway to demonstrate recall (typically 10-30 words)

**Continuation length limit:** Cap at 20 words. Tebuk tests recall initiation, not endurance. Short continuation keeps rounds fast (~15-30 seconds each).

### Components

**`src/components/hifz/HifzTebukSession.tsx`** — Session orchestrator:
- State machine: `idle` → `prompt` → `playing` → `reciting` → `result` → (next round or `complete`)
- Manages 3 rounds sequentially
- Creates `TasmiSession` per round with `expectedText = prompt.continuationText`
- Wires `TalqinPlayer` for the 4-word audio prompt
- On `audio.onPlaybackEnd`: starts `TasmiSession`
- On `TasmiSession` `session-end`: captures result, advances to next round
- On all rounds complete: aggregates results, calls `/api/hifz/rate-batch`

**`src/components/hifz/TebukPromptCard.tsx`** — Displays the 4-word prompt:
- Renders QCF V2 glyphs using the page font (WOFF2 already loaded)
- Large, centered display
- Play button to replay the audio
- After student attempts: reveals surah:ayah reference below the prompt
- Visual indicator for round number (1/3, 2/3, 3/3)

**`src/components/hifz/TebukResultCard.tsx`** — Per-round result:
- Shows accuracy percentage
- Shows talqin count (how many prompts were needed)
- Shows the FSRS label (ulang/tersangkut/lancar/mantap)
- "Next Round" button (or "View Results" on final round)

**`src/components/hifz/TebukSessionSummary.tsx`** — Final summary:
- 3 rounds with individual scores
- Aggregate score
- FSRS rating applied to the page's ayahs

### Scoring

Each round produces a `TasmiSessionResult`. We use the existing `tasmiResultToFsrsRating()` mapping:

| Accuracy | Talqin Ratio | Label | FSRS |
|----------|-------------|-------|------|
| < 50% | > 30% | ulang | 1 (Again) |
| 50-79% | > 10% | tersangkut | 2 (Hard) |
| 80-94% | low | lancar | 3 (Good) |
| >= 95% | minimal | mantap | 4 (Easy) |

Aggregate session rating = minimum rating across 3 rounds (weakest link). Applied via `/api/hifz/rate-batch` to the continuation ayahs.

### Route

`/read/[page]?flow=tebuk` — Enters tebuk mode for the current page. The page must have hifz status >= `sabqi` (you need to have memorized it to be tested on it).

### Entry Points

- "Tebuk" button on the hifz review screen when viewing a sabqi/manzil page
- Can also be triggered from the daily review queue (as an alternative to standard tasmi')

---

## Feature 2: Progressive Unveil

### Concept

A full mushaf page is covered by an opaque veil. The student recites the entire page from memory. As the Tasmi' engine confirms each word is correct, the veil peels back word-by-word, revealing the text underneath — visual confirmation of recall in real-time.

### Session Flow

```
Enter Veiled Mode on /read/[page]
  → Load page manifest (word hitboxes with x/y/w/h)
  → Build ordered word list from MushafLayoutPage
  → Render page image with full veil overlay
  → Play first ayah audio (TalqinPlayer.playRange, first 3 words) as prompt
  → audio.onPlaybackEnd → TasmiSession.start() with all page words
  → Student recites from memory:
      On each match event:
        → Read matchResult.lastCorrectIndex
        → Animate reveal of words 0..lastCorrectIndex
      On error:
        → Veil stays, talqin plays from stuck position
        → Student retries, reveal resumes
  → Session complete:
      → Full page revealed
      → Score card with accuracy/talqin
      → FSRS rating applied to page ayahs
```

### Core Logic: `src/lib/hifz/progressive-unveil.ts`

```typescript
interface UnveilWord {
  /** Index in the page word order */
  index: number;
  /** Word location "2:255:3" */
  location: string;
  /** Surah:ayah for reverse mapping */
  surah: number;
  ayah: number;
  wordPosition: number;
  /** Hitbox from manifest for positioning the reveal */
  hitbox: MushafWordHitbox;
}

interface UnveilState {
  words: UnveilWord[];
  revealedUpTo: number;  // -1 = all veiled. Derived: word is revealed if word.index <= revealedUpTo
  totalWords: number;
}

function buildUnveilState(
  layout: MushafLayoutPage,
  manifest: MushafPageManifest,
): UnveilState

function revealUpTo(
  state: UnveilState,
  wordIndex: number,
): UnveilState  // Returns new state (immutable)
```

**Word-to-hitbox mapping:**
- `MushafLayoutPage` gives words in reading order with `location` strings
- `MushafPageManifest` gives hitboxes with matching `location` strings
- Join on `location` to pair each ordered word with its pixel coordinates
- Words without a manifest hitbox are skipped (graceful degradation per project rules)

### Components

**`src/components/hifz/HifzUnveilSession.tsx`** — Session orchestrator:
- State machine: `idle` → `prompting` → `reciting` → `complete`
- Loads `MushafLayoutPage` + `MushafPageManifest` for the page
- Builds `UnveilState` from both data sources
- Creates `TasmiSession` with `expectedText` = all page words concatenated
- On `TasmiSession` `match` event: reads `matchResult.lastCorrectIndex`, calls `revealUpTo(state, index)` to update state
- On `TasmiSession` `talqin` event: pauses reveal. Uses `talqinWordIndex` (flat index into concatenated page text) to reverse-map to surah:ayah:wordPosition via the `UnveilState.words` array — `words[talqinWordIndex]` gives `{surah, ayah, wordPosition}` which is passed to `TalqinPlayer.play(surah, ayah, wordPosition)`.
- On `TasmiSession` `session-end`: shows score card

**`src/components/hifz/VeilOverlay.tsx`** — The visual veil:

SVG overlay positioned absolutely over the page image, same dimensions.

```
<svg viewBox="0 0 {imageWidth} {imageHeight}">
  <defs>
    <mask id="page-veil">
      <!-- White = veiled (opaque), black = revealed (transparent) -->
      <rect fill="white" width="100%" height="100%" />
      {revealedWords.map(word => (
        <rect
          key={word.location}
          fill="black"
          x={word.hitbox.x}
          y={word.hitbox.y}
          width={word.hitbox.width}
          height={word.hitbox.height}
          className="transition-opacity duration-200"
        />
      ))}
    </mask>
  </defs>
  <!-- The veil rectangle, masked to reveal words -->
  <rect
    fill="#f5f0e8"
    mask="url(#page-veil)"
    width="100%"
    height="100%"
  />
</svg>
```

**Veil color:** `#f5f0e8` (warm parchment) — matches the mushaf page background so the veil looks natural, like the text is hidden behind the page surface.

**Reveal animation:** Each word rect transitions from `opacity: 0` to `opacity: 1` over 200ms when added to the mask. Words reveal left-to-right within each line, top-to-bottom across lines — matching the reading flow.

**Browser compatibility note:** CSS transitions on SVG mask children have inconsistent support on Safari/iOS. Fallback: if `prefers-reduced-motion` is set or animation doesn't fire, words appear instantly (no transition). The reveal still works visually — just without the fade effect.

**Padding:** Each hitbox gets 2px padding on all sides to ensure the veil fully covers the glyph, accounting for minor manifest alignment variance.

**`src/components/hifz/UnveilResultCard.tsx`** — Session result:
- Accuracy percentage
- Talqin count
- Time taken
- FSRS label + rating
- Per-ayah breakdown (using `getPerAyahRatings` from fsrs-bridge)

### Scoring

Uses the same `tasmiResultToFsrsRating()` as Tebuk. Additionally, per-ayah granularity via `getPerAyahRatings()` — ayahs where the student struggled get lower ratings, clean ayahs get boosted.

### Route

`/read/[page]?flow=unveil` — Enters veiled mode for the current page.

### Entry Points

- "Veiled Mode" toggle on `/read/[page]` when page has hifz status >= `sabqi`
- Available alongside existing review modes (standard tasmi', tebuk)

### Graceful Degradation

Per project rules (never crash on missing data):
- **Missing manifest:** Fall back to line-level veil (reveal entire lines instead of individual words). Use `pageReveal.ts` boundary logic for approximate line positions.
- **Missing quran-align timestamps:** Skip the initial audio prompt. Go straight to TasmiSession.
- **Missing word in manifest:** Skip that word in the veil. The text shows through, student still recites it.

---

## Shared Types: `src/types/hifz-exercises.ts`

```typescript
/** Supported hifz exercise flows */
export type HifzFlow = 'tebuk' | 'unveil';

/** Result of a single tebuk round */
export interface TebukRoundResult {
  /** The prompt that was played */
  prompt: TebukPrompt;
  /** Tasmi' session result for this round */
  tasmiResult: TasmiSessionResult;
  /** FSRS rating derived from tasmi' result */
  rating: FsrsRating;
  /** BM label */
  label: TasmiRatingLabel;
}

/** Common session result shape for hifz exercises */
export interface HifzExerciseResult {
  flow: HifzFlow;
  pageNumber: number;
  rounds: TebukRoundResult[] | null;  // Tebuk only
  unveilResult: TasmiSessionResult | null;  // Unveil only
  aggregateRating: FsrsRating;
  ayahRatings: Array<{ ayahKey: string; rating: FsrsRating }>;
  durationSeconds: number;
}
```

### Ayah Word Ranges Builder: `src/lib/hifz/page-words.ts`

Both features need to map flat word indices back to per-ayah ranges for `getPerAyahRatings()`. The `getPageWords()` function returns words in order with `surah`/`ayah` fields. We derive ayah ranges by grouping consecutive words:

```typescript
function buildAyahWordRanges(
  words: PageWord[],
): Array<{ ayah: number; surah: number; ayahKey: string; startWordIndex: number; endWordIndex: number }>
```

Groups words by `surah:ayah`, preserving order. Each group's `startWordIndex`/`endWordIndex` maps to the flat concatenated text, which is exactly what `getPerAyahRatings()` expects.

---

## API Changes

### No new API routes needed

Both features use existing endpoints:
- `/api/hifz/rate-batch` — Apply FSRS ratings to ayahs after session
- `/api/tasmi/session` — Log the tasmi' session result

### Validation

The existing Zod schemas on these routes already handle the required fields. No schema changes needed.

---

## Data Requirements

### Already available — no new data needed

| Data | Source | Location |
|------|--------|----------|
| Word timestamps | cpfair/quran-align (Alafasy) | `public/data/quran-align-alafasy.json` |
| Page layout + words | zonetecde/mushaf-layout | `data/mushaf-layout/mushaf/page-NNN.json` |
| Word hitboxes | Rendered manifests | `assets/manifests/page_NNN.manifest.json` |
| Ayah audio | EveryAyah.com (Alafasy 128kbps) | Runtime fetch, service worker cached |
| QCF V2 fonts | quran.com | `assets/fonts/qcf-v2-woff2/pN.woff2` |

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Page has < 1 eligible ayah for tebuk | Show message: "Not enough ayahs for tebuk on this page" |
| Transcription server unavailable | TasmiSession error handler retries, then ends session with partial results |
| Audio fails to load | Skip audio prompt, start TasmiSession directly (graceful degradation) |
| Manifest missing for unveil | Fall back to line-level veil using `pageReveal.ts` boundaries |
| VAD fails to initialize | Show error message, offer manual recording fallback |
| Student abandons mid-session | `TasmiSession.end()` with partial results, rate based on what was completed |

---

## Testing Strategy

### Unit Tests

**`src/lib/hifz/tebuk.test.ts`**
- `pickTebukPrompts` returns correct count of prompts
- Prompts come from different ayahs
- Skips ayahs with < 5 words
- Skips basmala and surah-header lines
- Continuation text is correctly built (rest of ayah + next ayah)
- Continuation capped at 20 words

**`src/lib/hifz/progressive-unveil.test.ts`**
- `buildUnveilState` creates correct word count from layout + manifest
- `revealUpTo` returns new state (immutability check)
- `revealUpTo` reveals correct words up to index
- Handles missing manifest hitboxes gracefully (skip word)
- Word ordering matches reading order (right-to-left within line, top-to-bottom)

**`src/lib/tasmi/talqin-player.test.ts`** (extend existing)
- `playRange` seeks to correct startMs and stops at endMs
- Falls back to full ayah when timestamps missing

### Integration Tests

- Tebuk session: prompt → audio → tasmi → score → rate-batch API call
- Unveil session: start → word-by-word reveal → complete → rate-batch API call

### E2E Tests

- Full tebuk flow: enter page → start tebuk → complete 3 rounds → see summary
- Full unveil flow: enter page → toggle veiled mode → recite → see page reveal → see score

---

## File Inventory

### New Files (13)

| File | Lines (est.) | Purpose |
|------|-------------|---------|
| `src/lib/hifz/tebuk.ts` | ~120 | Prompt selection + continuation building |
| `src/lib/hifz/progressive-unveil.ts` | ~80 | Unveil state management |
| `src/lib/hifz/page-words.ts` | ~60 | Shared page word ordering + ayah range builder |
| `src/types/hifz-exercises.ts` | ~40 | Shared types (HifzFlow, TebukRoundResult, HifzExerciseResult) |
| `src/components/hifz/HifzTebukSession.tsx` | ~200 | Tebuk session orchestrator |
| `src/components/hifz/TebukPromptCard.tsx` | ~80 | 4-word prompt display |
| `src/components/hifz/TebukResultCard.tsx` | ~60 | Per-round result display |
| `src/components/hifz/TebukSessionSummary.tsx` | ~80 | Final 3-round summary |
| `src/components/hifz/HifzUnveilSession.tsx` | ~200 | Unveil session orchestrator |
| `src/components/hifz/VeilOverlay.tsx` | ~100 | SVG veil with animated reveals |
| `src/components/hifz/UnveilResultCard.tsx` | ~70 | Unveil session result display |
| `src/lib/hifz/tebuk.test.ts` | ~100 | Unit tests for tebuk logic |
| `src/lib/hifz/progressive-unveil.test.ts` | ~100 | Unit tests for unveil logic |

### Modified Files (2)

| File | Change |
|------|--------|
| `src/lib/tasmi/talqin-player.ts` | Add `playRange()` method (~30 lines) |
| `src/app/read/[page]/page.tsx` | Extend `HifzFlow` type to include `'tebuk' \| 'unveil'`, route to new components |

### No changes to

- `TasmiSession` — existing events are sufficient
- `SequenceMatcher` — `lastCorrectIndex` already exposed
- `fsrs-bridge.ts` — existing rating logic covers both features
- API routes — existing `/api/hifz/rate-batch` and `/api/tasmi/session` are sufficient
- Database schema — no new tables or columns needed
