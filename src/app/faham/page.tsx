export const dynamic = "force-dynamic";

import Link from "next/link";
import { FahamWorkspace } from "@/components/FahamWorkspace";
import { ModeNavigator } from "@/components/ModeNavigator";
import { TOP_FAHAM_WORD_LIMIT } from "@/lib/faham/config";
import type { FahamQueueSnapshot } from "@/lib/faham/queue";
import { ThemeToggle } from "@/components/ThemeToggle";
import { buildFahamQueueSnapshot } from "@/lib/faham/queue";
import { getReadJumpTargets } from "@/lib/readNavigation";
import { requireAuthUser } from "@/lib/auth";

export default async function FahamPage() {
  const user = await requireAuthUser("/faham");
  const userId = user.id;
  const jumpTargets = await getReadJumpTargets();
  let setupMessage: string | null = null;
  let initialQueue: FahamQueueSnapshot = {
    blockedReason: null,
    due: [],
    new: [],
    stats: {
      dueCount: 0,
      eligibleNewCount: 0,
      focusWordLimit: TOP_FAHAM_WORD_LIMIT,
      totalCandidateCount: 0,
    },
  };

  try {
    initialQueue = await buildFahamQueueSnapshot(userId, {});
  } catch {
    setupMessage =
      "Enjin Faham perlukan migration SQL baharu sebelum queue boleh dimuatkan. Jalankan SQL di Supabase editor dahulu.";
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_8%,rgba(180,83,9,0.16),transparent_30%),radial-gradient(circle_at_84%_0%,rgba(20,94,89,0.18),transparent_34%)] dark:bg-[radial-gradient(circle_at_12%_8%,rgba(217,119,6,0.16),transparent_30%),radial-gradient(circle_at_84%_0%,rgba(15,118,110,0.24),transparent_34%)]" />

      <main className="relative mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 lg:py-12">
        <header className="flex w-full justify-end">
          <ThemeToggle />
        </header>

        <ModeNavigator
          activeMode="faham"
          surahTargets={jumpTargets.surahs}
        />

        <FahamWorkspace initialQueue={initialQueue} setupMessage={setupMessage} />
      </main>
    </div>
  );
}
