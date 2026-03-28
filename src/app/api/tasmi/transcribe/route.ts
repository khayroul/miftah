import { NextResponse } from "next/server";

export const runtime = "nodejs";

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
  const serverUrl = getTasmiServerUrl();
  const apiKey = getTasmiApiKey();

  if (!serverUrl || !apiKey) {
    return NextResponse.json(
      { error: "Tasmi server is not configured" },
      { status: 500 },
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
