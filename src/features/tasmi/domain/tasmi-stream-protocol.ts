import { z } from "zod";

export const TASMI_STREAM_PROTOCOL = "tasmi-stream-v1" as const;
export const TASMI_STREAM_SAMPLE_RATE = 16_000 as const;

const HypothesisSchema = z.object({
  type: z.enum(["partial", "final"]),
  utterance_id: z.number().int().min(0),
  revision: z.number().int().min(1),
  normalized_text: z.string().max(20_000),
  audio_ms: z.number().int().min(0),
  inference_ms: z.number().int().min(0),
}).strict();

const ServerMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("ready"),
    protocol: z.literal(TASMI_STREAM_PROTOCOL),
    sample_rate: z.literal(TASMI_STREAM_SAMPLE_RATE),
  }).strict(),
  HypothesisSchema,
  z.object({
    type: z.literal("error"),
    code: z.string().min(1).max(100),
    recoverable: z.boolean(),
    utterance_id: z.number().int().min(0).optional(),
  }).strict(),
  z.object({ type: z.literal("paused") }).strict(),
  z.object({ type: z.literal("resumed") }).strict(),
  z.object({ type: z.literal("pong") }).strict(),
]);

export const StreamTicketSchema = z.object({
  wsUrl: z.string().url().refine(url => url.startsWith("ws://") || url.startsWith("wss://")),
  ticket: z.string().min(32).max(256),
  expiresAt: z.number().int().positive(),
  protocol: z.literal(TASMI_STREAM_PROTOCOL),
}).strict();

export type TasmiStreamServerMessage = z.infer<typeof ServerMessageSchema>;
export type TasmiStreamHypothesis = z.infer<typeof HypothesisSchema>;

export function parseTasmiStreamServerMessage(raw: unknown): TasmiStreamServerMessage | null {
  if (typeof raw !== "string") return null;
  try {
    const parsedJson: unknown = JSON.parse(raw);
    const parsed = ServerMessageSchema.safeParse(parsedJson);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
