export interface FahamTierVocabPackageMarker {
  appBuildId: string;
  dataVersion: string;
  updatedAt: number;
  wordLimit: number;
}

export interface FahamTierVocabWordPayload {
  frequency: number;
  id: number;
  textSimple: string;
  textUthmani: string;
  translationBm: string | null;
  translationEn: string | null;
  transliteration: string | null;
}

export interface CachedFahamTierVocabPayload {
  dataVersion: string;
  generatedAt: string;
  level: number;
  maxLevel: number;
  ok: true;
  wordLimit: number;
  words: FahamTierVocabWordPayload[];
}

export interface UnauthenticatedTierVocabPayload {
  dataVersion: string;
  ok: false;
  reason: "unauthenticated";
}

export type TierVocabPayload =
  | CachedFahamTierVocabPayload
  | UnauthenticatedTierVocabPayload;

export interface PrefetchFahamTierVocabResult {
  reason?: string;
  status: "already-current" | "cached" | "skipped";
  wordLimit: number | null;
}
