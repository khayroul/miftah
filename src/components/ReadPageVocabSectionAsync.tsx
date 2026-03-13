import { ReadPageVocabSection } from "@/components/ReadPageVocabSection";
import {
  buildFahamLevelProgress,
  getFahamLevelState,
  type FahamLevelProgress,
} from "@/lib/faham/levels";
import { getReadPageVocabPreview } from "@/lib/faham/repository";
import { getOptionalAuthUser } from "@/lib/auth-server";

interface ReadPageVocabSectionAsyncProps {
  ayahIds: number[];
  pageNumber: number;
}

const DEFAULT_LEVEL_PROGRESS: FahamLevelProgress = {
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

export async function ReadPageVocabSectionAsync({
  ayahIds,
  pageNumber,
}: ReadPageVocabSectionAsyncProps) {
  let levelProgress = DEFAULT_LEVEL_PROGRESS;
  let items: Awaited<ReturnType<typeof getReadPageVocabPreview>> = [];
  let loadError: string | null = null;

  try {
    const user = await getOptionalAuthUser();
    const userId = user?.id;

    if (userId) {
      const levelState = await getFahamLevelState(userId);
      levelProgress = buildFahamLevelProgress(levelState);
    }

    items = await getReadPageVocabPreview({
      ayahIds,
      limit: 6,
      userId,
      wordLimit: levelProgress.activeWordLimit,
    });
  } catch (error) {
    console.error("[read/page] Failed to load deferred page vocab preview", error);
    items = [];
    loadError = "Perkataan fokus tak dapat dimuatkan sekarang.";
  }

  return (
    <ReadPageVocabSection
      items={items}
      levelProgress={levelProgress}
      loadError={loadError}
      pageNumber={pageNumber}
    />
  );
}
