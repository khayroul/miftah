import { isFiniteNumber, isPositiveInt } from "./tierVocabMarker";
import type {
  CachedFahamTierVocabPayload,
  FahamTierVocabWordPayload,
  TierVocabPayload,
  UnauthenticatedTierVocabPayload,
} from "./tierVocabTypes";

function isFahamTierVocabWordPayload(value: unknown): value is FahamTierVocabWordPayload {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    isPositiveInt(record.id) &&
    isFiniteNumber(record.frequency) &&
    typeof record.textSimple === "string" &&
    typeof record.textUthmani === "string" &&
    (typeof record.translationBm === "string" || record.translationBm === null) &&
    (typeof record.translationEn === "string" || record.translationEn === null) &&
    (typeof record.transliteration === "string" || record.transliteration === null)
  );
}

function isCachedTierPayload(value: unknown): value is CachedFahamTierVocabPayload {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    record.ok === true &&
    typeof record.dataVersion === "string" &&
    typeof record.generatedAt === "string" &&
    isPositiveInt(record.level) &&
    isPositiveInt(record.maxLevel) &&
    isPositiveInt(record.wordLimit) &&
    Array.isArray(record.words) &&
    record.words.every(isFahamTierVocabWordPayload)
  );
}

function isUnauthenticatedPayload(value: unknown): value is UnauthenticatedTierVocabPayload {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    record.ok === false &&
    record.reason === "unauthenticated" &&
    typeof record.dataVersion === "string"
  );
}

export function parseTierVocabPayload(value: unknown): TierVocabPayload | null {
  if (isCachedTierPayload(value)) {
    return value;
  }
  if (isUnauthenticatedPayload(value)) {
    return value;
  }
  return null;
}
