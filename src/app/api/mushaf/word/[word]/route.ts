import { readFile } from "node:fs/promises";
import { resolveWordImageSource } from "@/lib/mushafAssets";

export const runtime = "nodejs";

interface WordImageRouteContext {
  params: Promise<{ word: string }>;
}

function parseWordId(value: string): number | null {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 999999) {
    return null;
  }
  return parsed;
}

export async function GET(
  _request: Request,
  context: WordImageRouteContext,
): Promise<Response> {
  const { word } = await context.params;
  const wordId = parseWordId(word);

  if (!wordId) {
    return Response.json({ error: "Invalid word id" }, { status: 400 });
  }

  const imageSource = await resolveWordImageSource(wordId);

  if (!imageSource) {
    return Response.json({ error: "Word image not found" }, { status: 404 });
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
    return Response.json({ error: "Failed to read word image" }, { status: 500 });
  }
}
