const AVERAGE_AYAT_PER_PAGE = 6236 / 604;

export function recommendHifzPageGoalFromAyahGoal(ayahGoal: number): number {
  if (!Number.isFinite(ayahGoal) || ayahGoal <= 0) {
    return 1;
  }

  return Math.max(1, Math.round(ayahGoal / AVERAGE_AYAT_PER_PAGE));
}
