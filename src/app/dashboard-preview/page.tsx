export const dynamic = "force-dynamic";

import Link from "next/link";
import { DashboardPreviewClient } from "@/components/DashboardPreviewClient";
import { ThemeToggle } from "@/components/ThemeToggle";
import { buildDailyPlanWithDetails } from "@/lib/hifz/scheduler";
import { getHifzStats } from "@/lib/hifz/stats";

const TOTAL_QURAN_AYAT = 6236;

interface HifzSnapshot {
  dueTodayCount: number;
  manzilCoveragePct: number;
  nextAyahLabel: string | null;
  streak: number;
  todayTotal: number;
  totalManzil: number;
}

function nextAyahLabel(
  plan: Awaited<ReturnType<typeof buildDailyPlanWithDetails>>,
): string | null {
  const nextItem = plan.sabqi[0] ?? plan.sabak[0] ?? plan.manzil[0];
  if (!nextItem) {
    return null;
  }

  return `${nextItem.ayah.surahId}:${nextItem.ayah.ayahNumber} ${nextItem.ayah.surahNameTranslit}`;
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
      dueTodayCount: stats.dueTodayCount,
      manzilCoveragePct: Math.min(
        100,
        Math.round((stats.totalManzil / TOTAL_QURAN_AYAT) * 100),
      ),
      nextAyahLabel: nextAyahLabel(plan),
      streak: stats.streak,
      todayTotal: plan.sabqi.length + plan.sabak.length + plan.manzil.length,
      totalManzil: stats.totalManzil,
    };
  } catch (error) {
    console.error("Failed to load dashboard preview hifz data", error);
    return null;
  }
}

export default async function DashboardPreviewPage() {
  const hifzSnapshot = await loadHifzSnapshot();

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_8%,rgba(20,94,89,0.18),transparent_34%),radial-gradient(circle_at_82%_0%,rgba(180,83,9,0.16),transparent_28%),radial-gradient(circle_at_88%_76%,rgba(79,70,229,0.12),transparent_26%)] dark:bg-[radial-gradient(circle_at_12%_8%,rgba(15,118,110,0.25),transparent_34%),radial-gradient(circle_at_82%_0%,rgba(180,83,9,0.18),transparent_28%),radial-gradient(circle_at_88%_76%,rgba(99,102,241,0.16),transparent_26%)]" />

      <main className="relative mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 lg:py-12">
        <header className="flex w-full items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-4 py-1.5 text-sm font-medium text-stone-700 shadow-sm transition hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700"
          >
            &larr; Utama
          </Link>
          <ThemeToggle />
        </header>

        <DashboardPreviewClient hifzSnapshot={hifzSnapshot} />
      </main>
    </div>
  );
}
