import { NextResponse } from "next/server";
import { getOptionalAuthUser } from "@/lib/auth-server";
import {
  buildFahamLevelProgress,
  getFahamLevelState,
  type FahamLevelProgress,
} from "@/lib/faham/levels";
import { getReadPageVocabPreview } from "@/lib/faham/repository";

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

export async function POST(request: Request): Promise<NextResponse> {
  let body: { ayahIds?: number[]; pageNumber?: number };

  try {
    body = (await request.json()) as { ayahIds?: number[]; pageNumber?: number };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const ayahIds = Array.isArray(body.ayahIds)
    ? body.ayahIds.filter((value) => Number.isInteger(value) && value > 0)
    : [];
  const pageNumber =
    typeof body.pageNumber === "number" && Number.isInteger(body.pageNumber)
      ? body.pageNumber
      : null;

  if (pageNumber === null || ayahIds.length === 0) {
    return NextResponse.json(
      { error: "ayahIds and pageNumber are required" },
      { status: 400 },
    );
  }

  try {
    const user = await getOptionalAuthUser();
    const userId = user?.id;

    let levelProgress = DEFAULT_LEVEL_PROGRESS;
    if (userId) {
      const levelState = await getFahamLevelState(userId);
      levelProgress = buildFahamLevelProgress(levelState);
    }

    const items = await getReadPageVocabPreview({
      ayahIds,
      limit: 6,
      userId,
      wordLimit: levelProgress.activeWordLimit,
    });

    return NextResponse.json({
      items,
      levelProgress,
      pageNumber,
    });
  } catch (error) {
    console.error("[api/faham/read-preview] Failed to load page vocab preview", error);
    return NextResponse.json(
      { error: "Perkataan fokus tak dapat dimuatkan sekarang." },
      { status: 500 },
    );
  }
}
