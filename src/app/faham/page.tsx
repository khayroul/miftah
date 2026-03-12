export const dynamic = "force-dynamic";

import { FahamWorkspace } from "@/components/FahamWorkspace";
import { ModeNavigator } from "@/components/ModeNavigator";
import type { FahamQueueSnapshot } from "@/lib/faham/queue";
import type { FahamLevelProgress } from "@/lib/faham/levels";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AuthStatusButton } from "@/components/AuthStatusButton";
import { buildFahamQueueSnapshot } from "@/lib/faham/queue";
import { getReadJumpTargets } from "@/lib/readNavigation";
import { getOptionalAuthUser } from "@/lib/auth-server";

function buildQuranWordAudioUrl(
  surah: number,
  ayah: number,
  wordPosition: number,
): string {
  const s = String(surah).padStart(3, "0");
  const a = String(ayah).padStart(3, "0");
  const w = String(wordPosition).padStart(3, "0");
  return `https://audio.qurancdn.com/wbw/${s}_${a}_${w}.mp3`;
}

export default async function FahamPage() {
  const user = await getOptionalAuthUser();
  const userId = user?.id;
  const jumpTargets = await getReadJumpTargets();
  let setupMessage: string | null = null;
  const defaultLevelProgress: FahamLevelProgress = {
    activeLevel: 1,
    activeWordLimit: 1000,
    isMaxLevel: false,
    lemmaUnlocked: false,
    maxLevel: 4,
    nextLevel: 2,
    nextWordLimit: 2000,
    unlockFoundProgress: 0,
    unlockFoundRequired: 600,
    unlockMasteredProgress: 0,
    unlockMasteredRequired: 0,
    unlockReady: false,
  };
  let initialQueue: FahamQueueSnapshot = {
    blockedReason: null,
    due: [],
    levelProgress: defaultLevelProgress,
    new: [],
    mastered: [],
    learning: [],
    stats: {
      dueCount: 0,
      eligibleNewCount: 0,
      focusWordLimit: defaultLevelProgress.activeWordLimit,
      totalCandidateCount: 0,
      masteredCount: 0,
      learningCount: 0,
    },
  };

  if (userId) {
    try {
      initialQueue = await buildFahamQueueSnapshot(userId, {});
    } catch (error: unknown) {
      const debugMessage = error instanceof Error ? error.message : String(error);
      console.error("[faham/page] Failed to build initial queue:", error);
      setupMessage =
        "Enjin Faham perlukan migration SQL baharu sebelum queue boleh dimuatkan. Jalankan SQL di Supabase editor dahulu. Debug: " +
        debugMessage;
    }
  } else {
    setupMessage = "Akaun Diperlukan: Anda sedang menggunakan mod pratonton. Log masuk untuk menyimpan kemajuan anda.";
    initialQueue.new = [
      {
        due: new Date().toISOString(),
        kind: "new",
        mcq: {
          answerLabel: "Makna BM",
          answerPrimary: "Dengan nama",
          answerSecondary: null,
          correctIndex: 0,
          direction: "arab_to_bm",
          options: [
            { dir: "ltr", lang: "ms", value: "Dengan nama" },
            { dir: "ltr", lang: "ms", value: "Segala puji" },
            { dir: "ltr", lang: "ms", value: "Tuhan" },
            { dir: "ltr", lang: "ms", value: "Raja" },
          ],
          promptDir: "rtl",
          promptHint: "Pilih makna BM paling tepat untuk perkataan Arab ini.",
          promptLabel: "Perkataan Arab",
          promptLang: "ar",
          promptPrimary: "بِسْمِ",
          promptSecondary: "bis'mi",
          promptAudioUrl: buildQuranWordAudioUrl(1, 1, 1),
          answerAudioUrl: null,
          whyThisSet: ["Contoh pratonton (Preview)"],
        },
        mistakeStreak: 0,
        needsReinforcement: false,
        progressId: -1,
        reps: 0,
        state: 0,
        word: {
          frequency: 500,
          id: -1,
          textSimple: "bis'mi",
          textUthmani: "بِسْمِ",
          translationBm: "Dengan nama",
          translationEn: null,
          transliteration: null,
        },
      },
      {
        due: new Date().toISOString(),
        kind: "new",
        mcq: {
          answerLabel: "Makna BM",
          answerPrimary: "Agama/Pembalasan",
          answerSecondary: null,
          correctIndex: 1,
          direction: "arab_to_bm",
          options: [
            { dir: "ltr", lang: "ms", value: "Hari" },
            { dir: "ltr", lang: "ms", value: "Agama/Pembalasan" },
            { dir: "ltr", lang: "ms", value: "Jalan" },
            { dir: "ltr", lang: "ms", value: "Tuhan" },
          ],
          promptDir: "rtl",
          promptHint: "Pilih makna BM paling tepat untuk perkataan Arab ini.",
          promptLabel: "Perkataan Arab",
          promptLang: "ar",
          promptPrimary: "ٱلدِّينِ",
          promptSecondary: "al-dini",
          promptAudioUrl: buildQuranWordAudioUrl(1, 4, 2),
          answerAudioUrl: null,
          whyThisSet: ["Contoh pratonton (Preview)"],
        },
        mistakeStreak: 0,
        needsReinforcement: false,
        progressId: -2,
        reps: 0,
        state: 0,
        word: {
          frequency: 300,
          id: -2,
          textSimple: "al-dini",
          textUthmani: "ٱلدِّينِ",
          translationBm: "Agama/Pembalasan",
          translationEn: null,
          transliteration: null,
        },
      }
    ];
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_8%,rgba(180,83,9,0.16),transparent_30%),radial-gradient(circle_at_84%_0%,rgba(20,94,89,0.18),transparent_34%)] dark:bg-[radial-gradient(circle_at_12%_8%,rgba(217,119,6,0.16),transparent_30%),radial-gradient(circle_at_84%_0%,rgba(15,118,110,0.24),transparent_34%)]" />

      <main className="relative mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 lg:py-12">
        <header className="flex w-full items-center justify-end gap-2">
          <AuthStatusButton />
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
