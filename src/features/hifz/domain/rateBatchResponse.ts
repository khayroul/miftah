export interface RateBatchResult {
  ok: boolean;
  progressId: number;
}

export interface RateBatchResponsePayload {
  error?: string;
  ok?: boolean;
  results?: RateBatchResult[];
}

/** Validate the complete batch receipt before client queue state can advance. */
export function isCompleteRateBatchResponse(
  responseOk: boolean,
  payload: unknown,
  expectedProgressIds: number[],
): payload is RateBatchResponsePayload & { ok: true; results: RateBatchResult[] } {
  if (!responseOk || typeof payload !== "object" || payload === null) {
    return false;
  }
  const candidate = payload as RateBatchResponsePayload;
  if (candidate.ok !== true || !Array.isArray(candidate.results)) return false;
  if (candidate.results.length !== expectedProgressIds.length) return false;

  const expected = new Set(expectedProgressIds);
  if (expected.size !== expectedProgressIds.length) return false;
  const received = new Set<number>();
  for (const result of candidate.results) {
    if (
      typeof result !== "object" ||
      result === null ||
      result.ok !== true ||
      !Number.isInteger(result.progressId) ||
      !expected.has(result.progressId) ||
      received.has(result.progressId)
    ) {
      return false;
    }
    received.add(result.progressId);
  }
  return received.size === expected.size;
}
