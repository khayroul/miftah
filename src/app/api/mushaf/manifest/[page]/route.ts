import { NextResponse } from "next/server";
import { loadPageManifest } from "@/lib/mushafAssets";

interface RouteParams {
  params: Promise<{ page: string }>;
}

export async function GET(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { page } = await params;
  const pageNumber = Number.parseInt(page, 10);

  if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > 604) {
    return NextResponse.json({ error: "Invalid page number" }, { status: 400 });
  }

  const manifest = await loadPageManifest(pageNumber);
  if (!manifest) {
    return NextResponse.json({ error: "Manifest not found" }, { status: 404 });
  }

  return NextResponse.json(manifest);
}
