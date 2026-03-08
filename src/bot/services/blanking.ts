export type BlankingLevel = 1 | 2 | 3 | 4;

interface WordInput {
  position: number;
  textUthmani: string;
}

interface BlankResult {
  display: string;
  blankedPositions: number[];
  totalWords: number;
}

/** Simple seeded PRNG (mulberry32) */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LEVEL_PCTS: Record<BlankingLevel, number> = {
  1: 0.3,
  2: 0.6,
  3: 0.9,
  4: 1.0,
};

/**
 * Generate a blanked version of an ayah's Arabic text.
 * Uses deterministic seeding so same ayah+level always blanks same words.
 */
export function blankAyah(
  words: WordInput[],
  level: BlankingLevel,
  seed = 0,
): BlankResult {
  if (words.length === 0)
    return { display: "", blankedPositions: [], totalWords: 0 };

  const pct = LEVEL_PCTS[level];
  const blankCount = Math.max(1, Math.round(words.length * pct));
  const rng = mulberry32(seed + level);

  // Create shuffled indices
  const indices = words.map((_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }

  const blankedSet = new Set(indices.slice(0, blankCount));
  const blankedPositions: number[] = [];

  // Build display string (RTL: words in original order, Telegram handles RTL)
  const parts = words.map((w, i) => {
    if (blankedSet.has(i)) {
      blankedPositions.push(w.position);
      return "_____";
    }
    return w.textUthmani;
  });

  return {
    display: parts.join(" "),
    blankedPositions: blankedPositions.sort((a, b) => a - b),
    totalWords: words.length,
  };
}
