import { HomeDashboardClient } from "@/features/home/components/HomeDashboardClient";
import { HomeDeferredUi } from "@/features/home/components/HomeDeferredUi";
import { ModeNavigator } from "@/features/read";
import { loadDashboardWithDbCache } from "@/features/home/server";
import { getReadJumpTargets } from "@/lib/readNavigation";
import { getOptionalAuthUser } from "@/lib/auth-server";

export default async function Home() {
  const userPromise = getOptionalAuthUser();
  const jumpTargetsPromise = getReadJumpTargets();
  const user = await userPromise;
  const [jumpTargets, initialSnapshot] = await Promise.all([
    jumpTargetsPromise,
    loadDashboardWithDbCache(user?.id ?? null),
  ]);

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_8%,rgba(20,94,89,0.18),transparent_34%),radial-gradient(circle_at_82%_0%,rgba(180,83,9,0.16),transparent_28%),radial-gradient(circle_at_88%_76%,rgba(79,70,229,0.12),transparent_26%)] dark:bg-[radial-gradient(circle_at_12%_8%,rgba(15,118,110,0.25),transparent_34%),radial-gradient(circle_at_82%_0%,rgba(180,83,9,0.18),transparent_28%),radial-gradient(circle_at_88%_76%,rgba(99,102,241,0.16),transparent_26%)]" />

      <main className="relative mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 lg:py-12">
        <ModeNavigator
          activeMode="read"
          surahTargets={jumpTargets.surahs}
          showUtilities
          showAuthStatus
          highlightHome
        />

        <HomeDashboardClient
          authUserId={user?.id ?? null}
          initialSnapshot={initialSnapshot}
          surahTargets={jumpTargets.surahs}
        />

        <HomeDeferredUi />
      </main>
    </div>
  );
}
