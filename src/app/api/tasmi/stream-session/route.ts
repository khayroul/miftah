import { NextResponse } from "next/server";
import { z } from "zod";
import { getOptionalAuthUser } from "@/features/auth/server";
import {
  getTasmiApiKey,
  getTasmiServerUrl,
  getTasmiWebSocketUrl,
} from "@/features/tasmi/server/config";

export const runtime = "nodejs";

const TicketResponseSchema = z.object({
  ticket: z.string().min(32).max(256),
  expires_at: z.number().int().positive(),
  protocol: z.literal("tasmi-stream-v1"),
}).strict();

const TICKET_TIMEOUT_MS = 4_000;

export async function POST(): Promise<NextResponse> {
  const user = await getOptionalAuthUser();
  if (!user) {
    return NextResponse.json(
      { error: "Log masuk diperlukan untuk sesi tasmi'" },
      { status: 401 },
    );
  }

  const serverUrl = getTasmiServerUrl();
  const apiKey = getTasmiApiKey();
  const wsUrl = getTasmiWebSocketUrl();
  if (!serverUrl || !apiKey || !wsUrl) {
    return NextResponse.json(
      { error: "Tasmi streaming is not configured" },
      { status: 503 },
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TICKET_TIMEOUT_MS);
  try {
    const response = await fetch(`${serverUrl}/stream-ticket`, {
      method: "POST",
      headers: { "x-api-key": apiKey },
      cache: "no-store",
      signal: controller.signal,
    });
    const rawPayload: unknown = await response.json().catch(() => null);
    const payload = TicketResponseSchema.safeParse(rawPayload);
    if (!response.ok || !payload.success) {
      return NextResponse.json(
        { error: "Tasmi streaming is temporarily unavailable" },
        { status: 503 },
      );
    }

    return NextResponse.json({
      wsUrl,
      ticket: payload.data.ticket,
      expiresAt: payload.data.expires_at,
      protocol: payload.data.protocol,
    });
  } catch {
    return NextResponse.json(
      { error: "Tasmi streaming is unreachable" },
      { status: 503 },
    );
  } finally {
    clearTimeout(timeout);
  }
}
