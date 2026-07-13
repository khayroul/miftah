export type HifzRevealStage = 1 | 2 | 3;
export interface AyahEndByLine {
  bottomY: number;
  linePosition: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function resolveBoundaryAtNearestAyahEndByLine(
  ayahEndsByLine: AyahEndByLine[],
  targetLinePosition: number,
  minLinePosition = Number.NEGATIVE_INFINITY,
): AyahEndByLine | null {
  const candidates = ayahEndsByLine.filter(
    (entry) => entry.linePosition >= minLinePosition,
  );
  if (candidates.length === 0) {
    return null;
  }

  let best = candidates[0];
  let bestDistance = Math.abs(best.linePosition - targetLinePosition);
  for (const candidate of candidates.slice(1)) {
    const distance = Math.abs(candidate.linePosition - targetLinePosition);
    if (
      distance < bestDistance ||
      (distance === bestDistance && candidate.linePosition < best.linePosition)
    ) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

export function resolveApproxThirdBoundariesByAyahEnd(
  ayahEndsByLine: AyahEndByLine[],
  totalLineCount: number,
  imageHeight: number,
): { firstBoundaryY: number; secondBoundaryY: number } {
  if (
    ayahEndsByLine.length === 0 ||
    !Number.isFinite(totalLineCount) ||
    totalLineCount <= 0 ||
    imageHeight <= 0
  ) {
    return { firstBoundaryY: imageHeight, secondBoundaryY: imageHeight };
  }

  const firstTargetLine = totalLineCount / 3;
  const secondTargetLine = (totalLineCount * 2) / 3;

  const firstEntry =
    resolveBoundaryAtNearestAyahEndByLine(ayahEndsByLine, firstTargetLine) ??
    ayahEndsByLine[0];
  const secondEntry =
    resolveBoundaryAtNearestAyahEndByLine(
      ayahEndsByLine,
      secondTargetLine,
      firstEntry.linePosition + 0.01,
    ) ?? firstEntry;

  const firstRaw = firstEntry.bottomY;
  const secondRaw = Math.max(secondEntry.bottomY, firstRaw);

  const firstBoundaryY = clamp(firstRaw, 1, imageHeight);
  const secondBoundaryY = clamp(
    Math.max(secondRaw, firstBoundaryY),
    1,
    imageHeight,
  );

  return { firstBoundaryY, secondBoundaryY };
}

export function calculateHifzRevealStageByAyahKeys(
  firstSegmentAyahKeys: string[],
  secondSegmentAyahKeys: string[],
  memorizedAyahKeys: Set<string>,
): HifzRevealStage {
  if (firstSegmentAyahKeys.length === 0) {
    return 3;
  }

  const firstSegmentReady = firstSegmentAyahKeys.every((key) =>
    memorizedAyahKeys.has(key),
  );
  if (!firstSegmentReady) {
    return 1;
  }

  if (secondSegmentAyahKeys.length === 0) {
    return 3;
  }

  const secondSegmentReady = secondSegmentAyahKeys.every((key) =>
    memorizedAyahKeys.has(key),
  );
  if (!secondSegmentReady) {
    return 2;
  }

  return 3;
}
