import { ModeNavigator } from "@/features/read";
import {
  HifzOverview,
  countUniquePlanItemPages,
  emptyPageGrid,
  getCachedDailyPlan,
  getCachedHifzStats,
  getCachedJuzProgress,
  getCachedPageProgressGrid,
  getCachedHasAnyHifzProgress,
  type DailyPlanWithDetails,
  type HifzStats,
  type JuzStat,
  type PageGridEntry,
} from "@/features/hifz/server";
import { LightweightBreadcrumb } from "@/features/read";
import { getReadJumpTargets } from "@/lib/readNavigation";
import { getOptionalAuthUser } from "@/lib/auth-server";
import { getUserStreak } from "@/lib/activity";

export default async function HifzPage() {
  const userPromise = getOptionalAuthUser();
  const jumpTargetsPromise = getReadJumpTargets();
  const user = await userPromise;
  const userId = user?.id ?? null;

  let plan: DailyPlanWithDetails;
  let stats: HifzStats;
  let juzProgress: JuzStat[];
  let pageGrid: PageGridEntry[] = [];
  let globalStreak = 0;
  let canStartFresh = false;

  // jumpTargets, hasStarted, and streak are all independent of each other
  const [jumpTargets, hasStarted, streak] = await Promise.all([
    jumpTargetsPromise,
    userId ? getCachedHasAnyHifzProgress(userId) : Promise.resolve(false),
    userId ? getUserStreak(userId) : Promise.resolve(null),
  ]);

  if (userId) {
    canStartFresh = !hasStarted;
    globalStreak = streak?.current_streak ?? 0;

    if (hasStarted) {
      [plan, stats, juzProgress, pageGrid] = await Promise.all([
        getCachedDailyPlan(userId),
        getCachedHifzStats(userId),
        getCachedJuzProgress(userId),
        getCachedPageProgressGrid(userId),
      ]);
    } else {
      plan = { sabqi: [], sabak: [], manzil: [] } as DailyPlanWithDetails;
      stats = {
        totalManzilPages: 0,
        dueTodayPages: 0,
        streak: 0,
      };
      juzProgress = Array.from({ length: 30 }, (_, i) => ({
        juz: i + 1,
        totalPages: 20,
        manzilPages: 0,
        sabqiPages: 0,
        sabakPages: 0,
        notStartedPages: 20,
        manzilPagePct: 0,
      }));
      pageGrid = emptyPageGrid();
    }
  } else {
    // Guest preview data — simplified counts only
    plan = { sabqi: [], sabak: [], manzil: [] } as unknown as DailyPlanWithDetails;
    stats = {
      totalManzilPages: 68,
      dueTodayPages: 8,
      streak: 9,
    };
    juzProgress = Array.from({ length: 30 }, (_, i) => ({
      juz: i + 1,
      totalPages: 20,
      manzilPages: 0,
      sabqiPages: 0,
      sabakPages: 0,
      notStartedPages: 20,
      manzilPagePct: 0,
    }));
    pageGrid = emptyPageGrid();
  }

  const newPageCount = userId ? countUniquePlanItemPages(plan.sabak) : 4;
  const reviewPageCount = userId
    ? countUniquePlanItemPages([...plan.sabqi, ...plan.manzil])
    : 8;
  const hasProgress = userId
    ? plan.sabak.length + plan.sabqi.length + plan.manzil.length > 0 ||
      stats.totalManzilPages > 0
    : false;

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_12%,rgba(20,94,89,0.18),transparent_34%),radial-gradient(circle_at_85%_0%,rgba(180,83,9,0.16),transparent_30%)] dark:bg-[radial-gradient(circle_at_16%_12%,rgba(15,118,110,0.22),transparent_34%),radial-gradient(circle_at_85%_0%,rgba(180,83,9,0.18),transparent_30%)]" />

      <main className="relative mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 lg:py-12">
        <ModeNavigator
          activeMode="hifz"
          surahTargets={jumpTargets.surahs}
          showUtilities
        />
        <LightweightBreadcrumb
          items={[
            { href: "/", label: "Utama" },
            { label: "Hafal" },
          ]}
        />

        {!userId && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-center text-sm text-amber-900 shadow-sm dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300">
            <strong>Akaun Diperlukan:</strong> Anda sedang menggunakan mod pratonton. Sila log masuk untuk menyimpan profil memori dan kemajuan hafalan anda.
          </div>
        )}

        <HifzOverview
          newPages={newPageCount}
          reviewPages={reviewPageCount}
          stats={stats}
          globalStreak={globalStreak}
          juzProgress={juzProgress}
          pageGrid={pageGrid}
          isGuest={!userId}
          hasProgress={hasProgress}
          canStartFresh={canStartFresh}
        />
      </main>
    </div>
  );
}
