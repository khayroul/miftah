export const dynamic = "force-dynamic";

import { DashboardPreviewClient } from "@/components/DashboardPreviewClient";
import { ThemeToggle } from "@/components/ThemeToggle";
import { buildDailyPlanWithDetails } from "@/lib/hifz/scheduler";
import { getHifzStats } from "@/lib/hifz/stats";
import { loadHomeDashboardSnapshot } from "@/lib/homeDashboard";

const TOTAL_QURAN_PAGES = 604;

interface HifzSnapshot {
  dueTodayPages: number;
  manzilCoveragePct: number;
  nextPageLabel: string | null;
  streak: number;
  todayPages: number;
  totalManzilPages: number;
}

function nextPageLabel(
  plan: Awaited<ReturnType<typeof buildDailyPlanWithDetails>>,
): string | null {
  const nextItem = plan.sabqi[0] ?? plan.sabak[0] ?? plan.manzil[0];
  if (!nextItem) {
    return null;
  }

  return `Halaman ${nextItem.ayah.pageNumber} · ${nextItem.ayah.surahNameTranslit}`;
}

async function loadHifzSnapshot(): Promise<HifzSnapshot | null> {
  const userId = process.env.MIFTAH_USER_ID;
  if (!userId) {
    return null;
  }

  try {
    const [plan, stats] = await Promise.all([
      buildDailyPlanWithDetails(userId),
      getHifzStats(userId),
    ]);

    return {
      dueTodayPages: stats.dueTodayPages,
      manzilCoveragePct: Math.min(
        100,
        Math.round((stats.totalManzilPages / TOTAL_QURAN_PAGES) * 100),
      ),
      nextPageLabel: nextPageLabel(plan),
      streak: stats.streak,
      todayPages: new Set(
        [...plan.sabqi, ...plan.sabak, ...plan.manzil].map((item) => item.ayah.pageNumber),
      ).size,
      totalManzilPages: stats.totalManzilPages,
    };
  } catch (error) {
    console.error("Failed to load dashboard preview hifz data", error);
    return null;
  }
}

export default async function DashboardPreviewPage() {
  const userId = process.env.MIFTAH_USER_ID ?? null;
  const hifzSnapshot = await loadHifzSnapshot();
  const homeSnapshot = await loadHomeDashboardSnapshot(userId);

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_8%,rgba(20,94,89,0.18),transparent_34%),radial-gradient(circle_at_82%_0%,rgba(180,83,9,0.16),transparent_28%),radial-gradient(circle_at_88%_76%,rgba(79,70,229,0.12),transparent_26%)] dark:bg-[radial-gradient(circle_at_12%_8%,rgba(15,118,110,0.25),transparent_34%),radial-gradient(circle_at_82%_0%,rgba(180,83,9,0.18),transparent_28%),radial-gradient(circle_at_88%_76%,rgba(99,102,241,0.16),transparent_26%)]" />

      <main className="relative mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 lg:py-12">
        <header className="flex w-full justify-end">
          <ThemeToggle />
        </header>

        <DashboardPreviewClient
          hifzSnapshot={hifzSnapshot}
          homeSnapshot={homeSnapshot}
        />
      </main>
    </div>
  );
}
