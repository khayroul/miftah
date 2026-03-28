import { NextResponse } from "next/server";
import { getOptionalAuthUser } from "@/lib/auth-server";
import { FAHAM_LEVEL_WORD_LIMITS } from "@/lib/faham/config";
import { getFahamLevelState } from "@/lib/faham/levels";
import { getFahamTierVocabWords } from "@/lib/faham/repository";

function parseRequestedWordLimit(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function resolveWordLimit(requested: number | null, activeWordLimit: number): number {
  if (requested === null) {
    return activeWordLimit;
  }

  const allowedLimits = FAHAM_LEVEL_WORD_LIMITS.filter((limit) => limit <= activeWordLimit);
  if (allowedLimits.length === 0) {
    return activeWordLimit;
  }

  const nearest = allowedLimits.find((limit) => requested <= limit);
  return nearest ?? allowedLimits[allowedLimits.length - 1] ?? activeWordLimit;
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const user = await getOptionalAuthUser();
    const userId = user?.id;
    const url = new URL(request.url);
    const dataVersion = url.searchParams.get("v") ?? "1";

    if (!userId) {
      return NextResponse.json(
        {
          ok: false,
          reason: "unauthenticated",
          dataVersion,
        },
        { status: 200 },
      );
    }

    const levelState = await getFahamLevelState(userId);
    const requestedLimit = parseRequestedWordLimit(url.searchParams.get("limit"));
    const wordLimit = resolveWordLimit(requestedLimit, levelState.activeWordLimit);
    const words = await getFahamTierVocabWords(wordLimit);

    return NextResponse.json({
      ok: true,
      dataVersion,
      generatedAt: new Date().toISOString(),
      level: levelState.activeLevel,
      maxLevel: levelState.maxLevel,
      wordLimit,
      words,
    });
  } catch (error) {
    console.error("[faham/tier-vocab] Error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
