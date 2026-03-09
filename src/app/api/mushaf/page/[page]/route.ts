import { readFile } from "node:fs/promises";
import { resolvePageImageSource } from "@/lib/mushafAssets";

export const runtime = "nodejs";

interface PageImageRouteContext {
  params: Promise<{ page: string }>;
}

function parsePageNumber(value: string): number | null {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 604) {
    return null;
  }
  return parsed;
}

export async function GET(
  request: Request,
  context: PageImageRouteContext,
): Promise<Response> {
  const { page } = await context.params;
  const pageNumber = parsePageNumber(page);

  if (!pageNumber) {
    return Response.json({ error: "Invalid page number" }, { status: 400 });
  }

  const url = new URL(request.url);
  const variant = url.searchParams.get("variant") === "thumb" ? "thumb" : "page";
  const imageSource = await resolvePageImageSource(pageNumber, variant);

  if (!imageSource) {
    return Response.json({ error: "Page image not found" }, { status: 404 });
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
    return Response.json({ error: "Failed to read page image" }, { status: 500 });
  }
}
