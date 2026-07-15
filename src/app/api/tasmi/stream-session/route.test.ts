import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getOptionalAuthUser: vi.fn(),
  getTasmiApiKey: vi.fn(() => "private-vps-key"),
  getTasmiServerUrl: vi.fn(() => "https://tasmi.example"),
  getTasmiWebSocketUrl: vi.fn(() => "wss://tasmi.example/ws/transcribe"),
}));

vi.mock("@/features/auth/server", () => ({
  getOptionalAuthUser: mocks.getOptionalAuthUser,
}));
vi.mock("@/features/tasmi/server/config", () => ({
  getTasmiApiKey: mocks.getTasmiApiKey,
  getTasmiServerUrl: mocks.getTasmiServerUrl,
  getTasmiWebSocketUrl: mocks.getTasmiWebSocketUrl,
}));

import { POST } from "./route";

describe("POST /api/tasmi/stream-session", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.getOptionalAuthUser.mockResolvedValue({ id: "user-1" });
    mocks.getTasmiApiKey.mockReturnValue("private-vps-key");
    mocks.getTasmiServerUrl.mockReturnValue("https://tasmi.example");
    mocks.getTasmiWebSocketUrl.mockReturnValue("wss://tasmi.example/ws/transcribe");
  });

  it("rejects logged-out callers before contacting the VPS", async () => {
    mocks.getOptionalAuthUser.mockResolvedValue(null);
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const response = await POST();

    expect(response.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns a one-time browser ticket without leaking the VPS key", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({
        ticket: "t".repeat(43),
        expires_at: Date.now() + 60_000,
        protocol: "tasmi-stream-v1",
      }), { status: 200 }),
    );

    const response = await POST();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual(expect.objectContaining({
      ticket: "t".repeat(43),
      wsUrl: "wss://tasmi.example/ws/transcribe",
    }));
    expect(JSON.stringify(payload)).not.toContain("private-vps-key");
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://tasmi.example/stream-ticket",
      expect.objectContaining({
        headers: { "x-api-key": "private-vps-key" },
      }),
    );
  });

  it("fails closed on malformed upstream tickets", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ticket: "short" }), { status: 200 }),
    );

    const response = await POST();

    expect(response.status).toBe(503);
  });
});
