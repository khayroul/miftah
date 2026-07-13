import { readFile } from "node:fs/promises";
import { resolveAyahImageSource } from "@/mushaf/lib/mushafAssets";

export const runtime = "nodejs";

interface AyahImageRouteContext {
  params: Promise<{ surah: string; ayah: string }>;
}

function parseAyahPart(value: string, max: number): number | null {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) {
    return null;
  }
  return parsed;
}

export async function GET(
  _request: Request,
  context: AyahImageRouteContext,
): Promise<Response> {
  const { surah, ayah } = await context.params;
  const surahNumber = parseAyahPart(surah, 114);
  const ayahNumber = parseAyahPart(ayah, 286);

  if (!surahNumber || !ayahNumber) {
    return Response.json({ error: "Invalid ayah reference" }, { status: 400 });
  }

  const imageSource = await resolveAyahImageSource(surahNumber, ayahNumber);

  if (!imageSource) {
    return Response.json({ error: "Ayah image not found" }, { status: 404 });
  }

  if (imageSource.kind === "remote") {
    return new Response(null, {
      status: 307,
      headers: {
        Location: imageSource.url,
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      },
    });
  }

  try {
    const imageBuffer = await readFile(imageSource.path);
    return new Response(imageBuffer, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      },
    });
  } catch {
    return Response.json({ error: "Failed to read ayah image" }, { status: 500 });
  }
}
