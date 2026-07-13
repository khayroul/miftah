import { NextResponse } from "next/server";
import { getOptionalAuthUser } from "@/features/auth/server";
import { getHifzTasmiAyahs } from "@/data/repositories/hifz";
import {
  MAX_TASMI_AYAH_IDS,
  parseTasmiAyahIds,
} from "@/features/hifz/domain/tasmiTextRequest";

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const ayahIds = parseTasmiAyahIds(body);
  if (!ayahIds) {
    return NextResponse.json(
      {
        error: `ayahIds must contain 1 to ${MAX_TASMI_AYAH_IDS} unique positive integers`,
      },
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
