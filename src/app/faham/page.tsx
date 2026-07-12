import { FahamWorkspace } from "@/components/FahamWorkspace";
import { ModeNavigator } from "@/components/ModeNavigator";
import type { FahamQueueSnapshot } from "@/lib/faham/queue";
import type { FahamLevelProgress } from "@/lib/faham/levels";
import { getReadJumpTargets } from "@/lib/readNavigation";
import { getOptionalAuthUser } from "@/lib/auth-server";
import {
  parseFahamSourcePreset,
} from "@/lib/faham/presets";

interface FahamPageProps {
  searchParams: Promise<{
    chunk?: string | string[];
    preset?: string | string[];
    surah?: string | string[];
  }>;
}

function pickQueryValue(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parsePositiveInt(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

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

export default async function FahamPage(props: FahamPageProps) {
  const [user, resolvedSearchParams, jumpTargets] = await Promise.all([
    getOptionalAuthUser(),
    props.searchParams,
    getReadJumpTargets(),
  ]);
  const userId = user?.id;
  const initialPreset = parseFahamSourcePreset(pickQueryValue(resolvedSearchParams.preset));
  const sourceSurah = parsePositiveInt(pickQueryValue(resolvedSearchParams.surah));
  const sourceChunk = parsePositiveInt(pickQueryValue(resolvedSearchParams.chunk));
  let setupMessage: string | null = null;
  const entryContext =
    initialPreset === "theme" && sourceSurah && sourceChunk
      ? {
          badge: "Masuk dari Tema",
          description:
            "Deck ini diutamakan untuk perkataan yang paling kuat muncul dalam tema yang baru anda teroka, supaya faham bergerak terus daripada konteks ayat tadi.",
          href: `/read/surah/${sourceSurah}/themes?chunk=${sourceChunk}`,
          hrefLabel: "Kembali ke Tema",
          title: `Tema Surah ${sourceSurah}, Bahagian ${sourceChunk}`,
        }
      : null;
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
  const initialQueue: FahamQueueSnapshot = {
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
  const shouldHydrateInitialQueue = Boolean(userId);

  if (!userId) {
    setupMessage = "Akaun Diperlukan: Anda sedang menggunakan mod pratonton. Log masuk untuk menyimpan kemajuan anda.";
    initialQueue.new = [
      {
        due: new Date().toISOString(),
        fsrs: {
          difficulty: 0,
          elapsedDays: 0,
          lapses: 0,
          lastReview: null,
          scheduledDays: 0,
          stability: 0,
        },
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
        fsrs: {
          difficulty: 0,
          elapsedDays: 0,
          lapses: 0,
          lastReview: null,
          scheduledDays: 0,
          stability: 0,
        },
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
        <ModeNavigator
          activeMode="faham"
          surahTargets={jumpTargets.surahs}
          showUtilities
        />

        <FahamWorkspace
          initialQueue={initialQueue}
          initialPreset={initialPreset}
          entryContext={entryContext}
          setupMessage={setupMessage}
          shouldHydrateInitialQueue={shouldHydrateInitialQueue}
        />
      </main>
    </div>
  );
}
