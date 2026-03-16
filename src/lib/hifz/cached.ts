import { unstable_cache } from "next/cache";
import { buildDailyPlanWithDetails } from "./scheduler";
import { getHifzStats, getJuzProgress, getPageProgressGrid } from "./stats";
import { hasAnyHifzProgress } from "./study-progress";

export const getCachedDailyPlan = unstable_cache(
  buildDailyPlanWithDetails,
  ["hifz-daily-plan"],
  { revalidate: 30, tags: ["hifz"] },
);

export const getCachedHifzStats = unstable_cache(
  getHifzStats,
  ["hifz-stats"],
  { revalidate: 30, tags: ["hifz"] },
);

export const getCachedJuzProgress = unstable_cache(
  getJuzProgress,
  ["hifz-juz-progress"],
  { revalidate: 60, tags: ["hifz"] },
);

export const getCachedPageProgressGrid = unstable_cache(
  getPageProgressGrid,
  ["hifz-page-grid"],
  { revalidate: 60, tags: ["hifz"] },
);

export const getCachedHasAnyHifzProgress = unstable_cache(
  hasAnyHifzProgress,
  ["hifz-has-progress"],
  { revalidate: 60, tags: ["hifz"] },
);
