export const dynamic = "force-dynamic";

import { ModeNavigator } from "@/components/ModeNavigator";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AuthStatusButton } from "@/components/AuthStatusButton";
import { HifzWorkspace } from "@/components/HifzWorkspace";
import { buildDailyPlanWithDetails } from "@/lib/hifz/scheduler";
import { getHifzStats, getJuzProgress } from "@/lib/hifz/stats";
import { getReadJumpTargets } from "@/lib/readNavigation";

import { getOptionalAuthUser } from "@/lib/auth";

export default async function HifzPage() {
  const user = await getOptionalAuthUser();
  const userId = user?.id;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let plan: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let stats: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let juzProgress: any;
  const jumpTargets = await getReadJumpTargets();

  if (userId) {
    [plan, stats, juzProgress] = await Promise.all([
      buildDailyPlanWithDetails(userId),
      getHifzStats(userId),
      getJuzProgress(userId),
    ]);
  } else {
    // Guest preview data
    plan = {
      sabqi: [],
      sabak: [
        {
          progress: {
            id: -1,
            user_id: "preview",
            ayah_id: 1,
            state: 0,
            reps: 0,
            mistake_streak: 0,
            needs_reinforcement: false,
            due: new Date().toISOString(),
            last_review: null,
            stability: 0,
            difficulty: 0,
            elapsed_days: 0,
            scheduled_days: 0,
            hifz_status: "sabak",
          },
          ayah: {
            id: 1,
            surahId: 1,
            ayahNumber: 1,
            textUthmani: "بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ",
            displayBm: "Dengan nama Allah, Yang Maha Pemurah, lagi Maha Mengasihani.",
            surahNameEn: "Al-Fatiha",
            surahNameTranslit: "Al-Fatihah",
          },
        },
      ],
      manzil: [],
    };
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

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_12%,rgba(20,94,89,0.18),transparent_34%),radial-gradient(circle_at_85%_0%,rgba(180,83,9,0.16),transparent_30%)] dark:bg-[radial-gradient(circle_at_16%_12%,rgba(15,118,110,0.22),transparent_34%),radial-gradient(circle_at_85%_0%,rgba(180,83,9,0.18),transparent_30%)]" />

      <main className="relative mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 lg:py-12">
        {/* Nav */}
        <header className="flex w-full items-center justify-end gap-2">
          <AuthStatusButton />
          <ThemeToggle />
        </header>

        <ModeNavigator
          activeMode="hifz"
          surahTargets={jumpTargets.surahs}
        />

        {!userId && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-center text-sm text-amber-900 shadow-sm dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300">
            <strong>Akaun Diperlukan:</strong> Anda sedang menggunakan mod pratonton. Sila log masuk untuk menyimpan profil memori dan kemajuan hafalan anda.
          </div>
        )}

        <HifzWorkspace plan={plan} stats={stats} juzProgress={juzProgress} />
      </main>
    </div>
  );
}
