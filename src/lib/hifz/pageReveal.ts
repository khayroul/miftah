export type HifzRevealStage = 1 | 2 | 3;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function resolveBoundaryAtAyahEnd(
  ayahBottomsAscending: number[],
  targetY: number,
  minY = 1,
): number {
  const candidates = ayahBottomsAscending.filter((bottom) => bottom >= minY);
  if (candidates.length === 0) {
    return ayahBottomsAscending[ayahBottomsAscending.length - 1] ?? targetY;
  }

  let atOrBelowTarget: number | null = null;
  for (const bottom of candidates) {
    if (bottom <= targetY) {
      atOrBelowTarget = bottom;
      continue;
    }
    break;
  }

  if (atOrBelowTarget !== null) {
    return atOrBelowTarget;
  }

  return candidates[0];
}

export function resolveApproxThirdBoundariesByAyahEnd(
  ayahBottomsAscending: number[],
  imageHeight: number,
): { firstBoundaryY: number; secondBoundaryY: number } {
  if (ayahBottomsAscending.length === 0 || imageHeight <= 0) {
    return { firstBoundaryY: imageHeight, secondBoundaryY: imageHeight };
  }

  const firstTargetY = imageHeight / 3;
  const secondTargetY = (imageHeight * 2) / 3;
  const firstRaw = resolveBoundaryAtAyahEnd(ayahBottomsAscending, firstTargetY);
  const secondRaw = resolveBoundaryAtAyahEnd(
    ayahBottomsAscending,
    secondTargetY,
    firstRaw + 1,
  );

  const firstBoundaryY = clamp(firstRaw, 1, imageHeight);
  const secondBoundaryY = clamp(Math.max(secondRaw, firstBoundaryY), 1, imageHeight);

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
