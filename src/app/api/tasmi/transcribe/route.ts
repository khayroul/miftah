import { NextResponse } from "next/server";
import { getOptionalAuthUser } from "@/features/auth/server";

export const runtime = "nodejs";

// Reject uploads larger than this before proxying to the transcription server.
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5MB

function getTasmiServerUrl(): string {
  return (
    process.env.TASMI_SERVER_URL?.trim() ||
    process.env.NEXT_PUBLIC_TASMI_SERVER_URL?.trim() ||
    ""
  ).replace(/\/$/, "");
}

function getTasmiApiKey(): string {
  return (
    process.env.TASMI_API_KEY?.trim() ||
    process.env.NEXT_PUBLIC_TASMI_API_KEY?.trim() ||
    ""
  );
}

function isConfigured(): boolean {
  return getTasmiServerUrl().length > 0 && getTasmiApiKey().length > 0;
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ configured: isConfigured() });
}

export async function POST(request: Request): Promise<NextResponse> {
  // Auth gate — mirror the sibling tasmi/session route (401 when logged out).
  const user = await getOptionalAuthUser();
  if (!user) {
    return NextResponse.json(
      { error: "Log masuk diperlukan untuk transkripsi tasmi'" },
      { status: 401 },
    );
  }

  const serverUrl = getTasmiServerUrl();
  const apiKey = getTasmiApiKey();

  if (!serverUrl || !apiKey) {
    return NextResponse.json(
      { error: "Tasmi server is not configured" },
      { status: 500 },
    );
  }

  // Reject oversized bodies before parsing/proxying (cheap Content-Length check).
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: "Audio terlalu besar" },
      { status: 413 },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Audio file is required" }, { status: 400 });
  }

  // Belt-and-braces: enforce the cap on the actual file size too (Content-Length
  // may be absent or understated).
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: "Audio terlalu besar" },
      { status: 413 },
    );
  }

  const upstreamForm = new FormData();
  upstreamForm.append("file", file, file.name || "chunk.wav");

  try {
    const response = await fetch(`${serverUrl}/transcribe`, {
      method: "POST",
      headers: { "x-api-key": apiKey },
      body: upstreamForm,
      cache: "no-store",
    });

    const payload = await response
      .json()
      .catch(() => ({ error: "Tasmi server returned invalid JSON" }));

    if (!response.ok) {
      return NextResponse.json(
        { error: payload.error ?? "Tasmi server error" },
        { status: response.status },
      );
    }

    return NextResponse.json(payload);
  } catch {
    return NextResponse.json(
      { error: "Tasmi server is unreachable" },
      { status: 502 },
    );
  }
}
