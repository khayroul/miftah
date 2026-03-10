export const dynamic = "force-dynamic";

import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";
import { HifzWorkspace } from "@/components/HifzWorkspace";
import { buildDailyPlanWithDetails } from "@/lib/hifz/scheduler";
import { getHifzStats, getJuzProgress } from "@/lib/hifz/stats";

export default async function HifzPage() {
  const userId = process.env.MIFTAH_USER_ID!;

  const [plan, stats, juzProgress] = await Promise.all([
    buildDailyPlanWithDetails(userId),
    getHifzStats(userId),
    getJuzProgress(userId),
  ]);

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_12%,rgba(20,94,89,0.18),transparent_34%),radial-gradient(circle_at_85%_0%,rgba(180,83,9,0.16),transparent_30%)] dark:bg-[radial-gradient(circle_at_16%_12%,rgba(15,118,110,0.22),transparent_34%),radial-gradient(circle_at_85%_0%,rgba(180,83,9,0.18),transparent_30%)]" />

      <main className="relative mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 lg:py-12">
        {/* Nav */}
        <header className="flex w-full items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-4 py-1.5 text-sm font-medium text-stone-700 shadow-sm transition hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700"
          >
            &larr; Utama
          </Link>
          <ThemeToggle />
        </header>

        <HifzWorkspace plan={plan} stats={stats} juzProgress={juzProgress} />
      </main>
    </div>
  );
}
