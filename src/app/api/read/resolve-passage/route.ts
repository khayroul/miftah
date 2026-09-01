import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolvePassageLocation } from "@/lib/passageNavigation";

const passageQuerySchema = z
  .object({
    surah: z.coerce.number().int().min(1).max(114),
    startAyah: z.coerce.number().int().min(1),
    endAyah: z.coerce.number().int().min(1),
  })
  .refine((value) => value.endAyah >= value.startAyah, {
    message: "End ayah must be after the start ayah.",
    path: ["endAyah"],
  });

export async function GET(request: NextRequest) {
  const parsed = passageQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  );

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Choose a valid surah and ayah range." },
      { status: 400 },
    );
  }

  try {
    const location = await resolvePassageLocation(
      parsed.data.surah,
      parsed.data.startAyah,
      parsed.data.endAyah,
    );

    if (!location) {
      return NextResponse.json(
        { error: "That ayah range could not be found." },
        { status: 404 },
      );
    }

    return NextResponse.json(location, {
      headers: {
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
      },
    });
  } catch (error: unknown) {
    console.error("[api/read/resolve-passage] Failed to resolve passage", error);
    return NextResponse.json(
      { error: "The passage could not be opened right now." },
      { status: 500 },
    );
  }
}
