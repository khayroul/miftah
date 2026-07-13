import { readFile } from "node:fs/promises";
import { resolvePageImageSource, type PageVariant } from "@/mushaf/lib/mushafAssets";

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

function parseVariant(url: URL): PageVariant | null {
  const variant = url.searchParams.get("variant");
  if (variant === null) {
    return "page";
  }
  if (variant === "thumb" || variant === "mobile") {
    return variant;
  }
  return null;
}

function getContentType(variant: PageVariant): string {
  return variant === "mobile" ? "image/webp" : "image/png";
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

  const variant = parseVariant(new URL(request.url));
  if (!variant) {
    return Response.json({ error: "Invalid page variant" }, { status: 400 });
  }

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
        "Content-Type": getContentType(variant),
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      },
    });
  } catch {
    return Response.json({ error: "Failed to read page image" }, { status: 500 });
  }
}
