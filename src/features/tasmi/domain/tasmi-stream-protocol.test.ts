import { describe, expect, it } from "vitest";
import {
  parseTasmiStreamServerMessage,
  StreamTicketSchema,
} from "./tasmi-stream-protocol";

describe("Tasmi stream protocol", () => {
  it("accepts a bounded final hypothesis", () => {
    const message = parseTasmiStreamServerMessage(JSON.stringify({
      type: "final",
      utterance_id: 3,
      revision: 2,
      normalized_text: "بسم الله",
      audio_ms: 900,
      inference_ms: 240,
    }));

    expect(message).toEqual(expect.objectContaining({ type: "final", utterance_id: 3 }));
  });

  it("rejects malformed, unknown, and over-permissive messages", () => {
    expect(parseTasmiStreamServerMessage("{")) .toBeNull();
    expect(parseTasmiStreamServerMessage(JSON.stringify({ type: "unknown" }))).toBeNull();
    expect(parseTasmiStreamServerMessage(JSON.stringify({
      type: "paused",
      unexpected: true,
    }))).toBeNull();
  });

  it("accepts only ws ticket URLs and the matching protocol", () => {
    expect(StreamTicketSchema.safeParse({
      wsUrl: "wss://tasmi.example/ws/transcribe",
      ticket: "a".repeat(32),
      expiresAt: Date.now() + 60_000,
      protocol: "tasmi-stream-v1",
    }).success).toBe(true);
    expect(StreamTicketSchema.safeParse({
      wsUrl: "https://tasmi.example/ws/transcribe",
      ticket: "a".repeat(32),
      expiresAt: Date.now() + 60_000,
      protocol: "tasmi-stream-v1",
    }).success).toBe(false);
  });
});
