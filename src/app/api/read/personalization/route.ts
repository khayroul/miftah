import { NextResponse } from "next/server";
import { z } from "zod";
import { getOptionalAuthUser } from "@/lib/auth-server";
import { getProgressByAyahIds } from "@/lib/hifz/study-progress";
import { getAyatIdentityByPage } from "@/lib/queries";

const searchParamsSchema = z.object({
  page: z.coerce.number().int().min(1).max(604),
});

export async function GET(request: Request): Promise<NextResponse> {
  const parseResult = searchParamsSchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries()),
  );

  if (!parseResult.success) {
    return NextResponse.json({ error: "Invalid page" }, { status: 400 });
  }

  try {
    const user = await getOptionalAuthUser();
    const userId = user?.id;
    if (!userId) {
      return NextResponse.json({ memorizedAyahKeys: [] });
    }

    const ayatOnPage = await getAyatIdentityByPage(parseResult.data.page);
    if (ayatOnPage.length === 0) {
      return NextResponse.json({ memorizedAyahKeys: [] });
    }

    const progressByAyahId = await getProgressByAyahIds(
      userId,
      ayatOnPage.map((ayah) => ayah.id),
    );

    const memorizedAyahKeys = ayatOnPage.flatMap((ayah) => {
      const status = progressByAyahId.get(ayah.id)?.hifz_status;
      if (status === "sabqi" || status === "manzil") {
        return [`${ayah.surah_id}:${ayah.ayah_number}`];
      }
      return [];
    });

    return NextResponse.json({ memorizedAyahKeys });
  } catch (error) {
    console.error("[read/personalization] Error:", error);
    return NextResponse.json(
      { error: "Unable to load read personalization" },
      { status: 500 },
    );
  }
}
