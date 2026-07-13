import type { MushafWordTranslationMap } from "@/mushaf/types/mushaf";

/**
 * Validates raw JSON data from a per-page translation file and returns a
 * typed MushafWordTranslationMap. Invalid or empty entries are filtered out.
 *
 * Filtering rules:
 * - Non-object values (strings, numbers, null, arrays) are dropped.
 * - Entries where both bm and en are absent or empty strings are dropped.
 * - The location key from the Record is assigned to the entry's `location` field.
 */
export function validatePageTranslations(data: unknown): MushafWordTranslationMap {
  if (
    data === null ||
    data === undefined ||
    typeof data !== "object" ||
    Array.isArray(data)
  ) {
    return {};
  }

  const raw = data as Record<string, unknown>;
  const result: MushafWordTranslationMap = {};

  for (const [key, value] of Object.entries(raw)) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      continue;
    }

    const entry = value as Record<string, unknown>;
    const bm = typeof entry.bm === "string" ? entry.bm : undefined;
    const en = typeof entry.en === "string" ? entry.en : undefined;

    // Filter entries where both translations are absent or empty
    const hasBm = bm !== undefined && bm !== "";
    const hasEn = en !== undefined && en !== "";
    if (!hasBm && !hasEn) {
      continue;
    }

    result[key] = {
      location: key,
      ...(bm !== undefined ? { bm } : {}),
      ...(en !== undefined ? { en } : {}),
    };
  }

  return result;
}

/**
 * Formats a page number as a 3-digit zero-padded string with dash separator.
 * e.g. 1 → "001", 42 → "042", 604 → "604"
 */
function formatPageNumber(pageNumber: number): string {
  return String(pageNumber).padStart(3, "0");
}

/**
 * Fetches the per-page translation JSON for a given page number.
 * Returns a validated MushafWordTranslationMap.
 * Throws on network errors or invalid JSON.
 */
export async function fetchPageTranslations(
  pageNumber: number
): Promise<MushafWordTranslationMap> {
  const padded = formatPageNumber(pageNumber);
  const url = `/translations/page-${padded}.json`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Failed to fetch translations for page ${pageNumber}: HTTP ${response.status}`
    );
  }

  const data: unknown = await response.json();
  return validatePageTranslations(data);
}
