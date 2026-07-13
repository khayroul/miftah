/** Safe upper bound above the current Quran page maximum of 32 ayat. */
export const MAX_TASMI_AYAH_IDS = 40;

export function parseTasmiAyahIds(body: unknown): number[] | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }

  const value = (body as { ayahIds?: unknown }).ayahIds;
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > MAX_TASMI_AYAH_IDS
  ) {
    return null;
  }

  const ayahIds = value.filter(
    (ayahId): ayahId is number =>
      typeof ayahId === "number" && Number.isInteger(ayahId) && ayahId > 0,
  );
  if (ayahIds.length !== value.length) return null;
  if (new Set(ayahIds).size !== ayahIds.length) return null;
  return ayahIds;
}
