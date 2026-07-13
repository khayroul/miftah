import { NextResponse } from "next/server";
import { getOptionalAuthUser } from "@/lib/auth-server";
import { getHifzTasmiAyahs } from "@/data/repositories/hifz";

interface TasmiTextBody {
  ayahIds?: unknown;
}

function parseAyahIds(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 30) {
    return null;
  }
  const ayahIds = value.filter(
    (ayahId): ayahId is number =>
      typeof ayahId === "number" && Number.isInteger(ayahId) && ayahId > 0,
  );
  if (ayahIds.length !== value.length) return null;
  return Array.from(new Set(ayahIds));
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: TasmiTextBody;
  try {
    body = (await request.json()) as TasmiTextBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const ayahIds = parseAyahIds(body.ayahIds);
  if (!ayahIds) {
    return NextResponse.json(
      { error: "ayahIds must contain 1 to 30 positive integers" },
      { status: 400 },
    );
  }

  try {
    const user = await getOptionalAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const ayahs = await getHifzTasmiAyahs(ayahIds);
    return NextResponse.json({ ayahs });
  } catch (error) {
    console.error("[hifz/tasmi-text] Error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
