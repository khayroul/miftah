import { NextResponse } from "next/server";
import { getOptionalAuthUser } from "@/features/auth/server";
import { getJuzukExamRound } from "@/data/repositories/tasmi";

// Mode B (juzuk exam): returns a random test ayah within the requested juz
// plus the recitation span to the end of its mushaf page.

const MAX_EXCLUDE_IDS = 50;

export async function GET(request: Request): Promise<NextResponse> {
  const user = await getOptionalAuthUser();
  if (!user) {
    return NextResponse.json(
      { error: "Log masuk diperlukan untuk ujian juzuk" },
      { status: 401 },
    );
  }

  const url = new URL(request.url);
  const juz = Number(url.searchParams.get("juz"));
  if (!Number.isInteger(juz) || juz < 1 || juz > 30) {
    return NextResponse.json(
      { error: "juz mesti integer 1-30" },
      { status: 400 },
    );
  }

  const excludeAyahIds = (url.searchParams.get("exclude") ?? "")
    .split(",")
    .map(s => Number(s))
    .filter(n => Number.isInteger(n) && n > 0)
    .slice(0, MAX_EXCLUDE_IDS);

  try {
    const round = await getJuzukExamRound(juz, excludeAyahIds);
    if (!round) {
      return NextResponse.json(
        { error: "Tiada ayat ditemui untuk juzuk ini" },
        { status: 404 },
      );
    }
    return NextResponse.json({ round });
  } catch (error) {
    console.error("[tasmi/juzuk-round] Error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
