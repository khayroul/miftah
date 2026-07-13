import type { ActivityStreak } from "./types";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

function dateDiffDays(newerDateKey: string, olderDateKey: string): number {
  const newer = new Date(`${newerDateKey}T00:00:00.000Z`).getTime();
  const older = new Date(`${olderDateKey}T00:00:00.000Z`).getTime();
  return Math.round((newer - older) / DAY_IN_MS);
}

export function buildStreakFromDateKeys(dateKeys: string[]): ActivityStreak {
  if (dateKeys.length === 0) {
    return { current_streak: 0, longest_streak: 0, last_activity_date: null };
  }

  const sorted = [...new Set(dateKeys)].sort((left, right) =>
    right.localeCompare(left),
  );
  let currentStreak = 1;
  for (let index = 1; index < sorted.length; index += 1) {
    if (dateDiffDays(sorted[index - 1], sorted[index]) === 1) {
      currentStreak += 1;
      continue;
    }
    break;
  }

  let longestStreak = 1;
  let run = 1;
  for (let index = 1; index < sorted.length; index += 1) {
    if (dateDiffDays(sorted[index - 1], sorted[index]) === 1) {
      run += 1;
      longestStreak = Math.max(longestStreak, run);
    } else {
      run = 1;
    }
  }

  return {
    current_streak: currentStreak,
    longest_streak: longestStreak,
    last_activity_date: sorted[0] ?? null,
  };
}
