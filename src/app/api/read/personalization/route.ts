import { NextResponse } from "next/server";
import { z } from "zod";
import { getOptionalAuthUser } from "@/lib/auth-server";
import {
  getAyatIdentityByPage,
  getMemorizedAyahIds,
} from "@/data/repositories/read";

const searchParamsSchema = z.object({
  page: z.coerce.number().int().min(1).max(604),
});

const personalizationBodySchema = z
  .object({
    ayahIds: z.array(z.number().int().positive()).max(50),
  })
  .strict();

async function authenticatedUserId(): Promise<string | null> {
  const user = await getOptionalAuthUser();
  return user?.id ?? null;
}

/**
 * Compatibility path for older clients. New Read clients POST ids they
 * already rendered, avoiding this Quran page lookup entirely.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const parseResult = searchParamsSchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries()),
  );

  if (!parseResult.success) {
    return NextResponse.json({ error: "Invalid page" }, { status: 400 });
  }

  try {
    const userId = await authenticatedUserId();
    if (!userId) {
      return NextResponse.json({ memorizedAyahKeys: [] });
    }

    const ayatOnPage = await getAyatIdentityByPage(parseResult.data.page);
    const memorizedAyahIds = await getMemorizedAyahIds(
      userId,
      ayatOnPage.map((ayah) => ayah.id),
    );
    const memorizedIdSet = new Set(memorizedAyahIds);
    const memorizedAyahKeys = ayatOnPage.flatMap((ayah) =>
      memorizedIdSet.has(ayah.id)
        ? [`${ayah.surah_id}:${ayah.ayah_number}`]
        : [],
    );

    return NextResponse.json({ memorizedAyahKeys });
  } catch (error) {
    console.error("[read/personalization] Error:", error);
    return NextResponse.json(
      { error: "Unable to load read personalization" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parseResult = personalizationBodySchema.safeParse(rawBody);
  if (!parseResult.success) {
    return NextResponse.json(
      { error: "Invalid ayahIds", issues: parseResult.error.issues },
      { status: 400 },
    );
  }

  try {
    const userId = await authenticatedUserId();
    if (!userId) {
      return NextResponse.json({ memorizedAyahIds: [] });
    }

    const memorizedAyahIds = await getMemorizedAyahIds(
      userId,
      parseResult.data.ayahIds,
    );
    return NextResponse.json({ memorizedAyahIds });
  } catch (error) {
    console.error("[read/personalization] Error:", error);
    return NextResponse.json(
      { error: "Unable to load read personalization" },
      { status: 500 },
    );
  }
}
