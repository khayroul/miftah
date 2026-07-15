import { NextResponse } from "next/server";
import { getOptionalAuthUser } from "@/features/auth/server";
import {
  getTasmiApiKey,
  getTasmiServerUrl,
} from "@/features/tasmi/server/config";

export const runtime = "nodejs";

// Reject uploads larger than this before proxying to the transcription server.
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5MB

function isConfigured(): boolean {
  return getTasmiServerUrl().length > 0 && getTasmiApiKey().length > 0;
}

// How long to wait for the transcription server's /health before declaring it
// unreachable. Kept short so the pre-flight check never stalls the UI.
const HEALTH_TIMEOUT_MS = 3000;

// A configured server can still be DOWN (VPS offline, redeploying). The client
// pre-flight must know REACHABILITY, not just that env vars are set — otherwise
// it drops the reciter into a live mic session that only fails at first upload.
async function isReachable(serverUrl: string): Promise<boolean> {
  if (!serverUrl) return false;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
  try {
    const response = await fetch(`${serverUrl}/health`, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(): Promise<NextResponse> {
  const configured = isConfigured();
  const reachable = configured ? await isReachable(getTasmiServerUrl()) : false;
  return NextResponse.json({ configured, reachable });
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
      signal: request.signal,
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
