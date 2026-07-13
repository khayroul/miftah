import { getProgressByAyahIds } from "@/data/repositories/hifz";

interface HifzStatusValue {
  hifz_status: string | null;
}

export function dedupeAyahIds(ayahIds: number[]): number[] {
  return Array.from(new Set(ayahIds));
}

export function resolveMemorizedAyahIds(
  ayahIds: number[],
  progressByAyahId: ReadonlyMap<number, HifzStatusValue>,
): number[] {
  return ayahIds.filter((ayahId) => {
    const status = progressByAyahId.get(ayahId)?.hifz_status;
    return status === "sabqi" || status === "manzil";
  });
}

/** Uses ids already present in the trusted server-rendered Read payload. */
export async function getMemorizedAyahIds(
  userId: string,
  knownAyahIds: number[],
): Promise<number[]> {
  const ayahIds = dedupeAyahIds(knownAyahIds);
  if (ayahIds.length === 0) {
    return [];
  }

  const progressByAyahId = await getProgressByAyahIds(userId, ayahIds);
  return resolveMemorizedAyahIds(ayahIds, progressByAyahId);
}
