export const dynamic = "force-dynamic";

import { ModeNavigator } from "@/components/ModeNavigator";
import { HifzOverview } from "@/components/HifzOverview";
import { LightweightBreadcrumb } from "@/components/LightweightBreadcrumb";
import { buildDailyPlanWithDetails } from "@/lib/hifz/scheduler";
import { hasAnyHifzProgress } from "@/lib/hifz/study-progress";
import { getHifzStats, getJuzProgress } from "@/lib/hifz/stats";
import { getReadJumpTargets } from "@/lib/readNavigation";
import { getOptionalAuthUser } from "@/lib/auth-server";
import { getUserStreak } from "@/lib/activity";
import type { DailyPlanWithDetails } from "@/lib/hifz/scheduler";
import type { HifzStats, JuzStat } from "@/lib/hifz/stats";

export default async function HifzPage() {
  const user = await getOptionalAuthUser();
  const userId = user?.id;

  let plan: DailyPlanWithDetails;
  let stats: HifzStats;
  let juzProgress: JuzStat[];
  let globalStreak = 0;
  let canStartFresh = false;
  const jumpTargets = await getReadJumpTargets();

  if (userId) {
    const hasStarted = await hasAnyHifzProgress(userId);
    canStartFresh = !hasStarted;
    const streak = await getUserStreak(userId);
    globalStreak = streak?.current_streak ?? 0;

    if (hasStarted) {
      [plan, stats, juzProgress] = await Promise.all([
        buildDailyPlanWithDetails(userId),
        getHifzStats(userId),
        getJuzProgress(userId),
      ]);
    } else {
      plan = { sabqi: [], sabak: [], manzil: [] } as DailyPlanWithDetails;
      stats = { totalManzil: 0, dueTodayCount: 0, streak: 0 };
      juzProgress = Array.from({ length: 30 }, (_, i) => ({
        juz: i + 1,
        totalAyat: 100,
        manzilCount: 0,
        sabqiCount: 0,
        sabakCount: 0,
        notStartedCount: 100,
        manzilPct: 0,
      }));
    }
  } else {
    // Guest preview data — simplified counts only
    plan = { sabqi: [], sabak: [], manzil: [] } as unknown as DailyPlanWithDetails;
    stats = { totalManzil: 68, dueTodayCount: 8, streak: 9 };
    juzProgress = Array.from({ length: 30 }, (_, i) => ({
      juz: i + 1,
      totalAyat: 100,
      manzilCount: 0,
      sabqiCount: 0,
      sabakCount: 0,
      notStartedCount: 100,
      manzilPct: 0,
    }));
  }

  const newCount = userId ? plan.sabak.length : 4;
  const reviewCount = userId ? plan.sabqi.length + plan.manzil.length : 8;
  const hasProgress = userId
    ? plan.sabak.length + plan.sabqi.length + plan.manzil.length > 0 ||
      stats.totalManzil > 0
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
          newCount={newCount}
          reviewCount={reviewCount}
          stats={stats}
          globalStreak={globalStreak}
          juzProgress={juzProgress}
          isGuest={!userId}
          hasProgress={hasProgress}
          canStartFresh={canStartFresh}
        />
      </main>
    </div>
  );
}
