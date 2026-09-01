import { readFile } from "node:fs/promises";
import path from "node:path";

interface VerseMetadataRow {
  page_number?: number;
}

interface VerseMetadataDataset {
  verses?: Record<string, VerseMetadataRow>;
}

export interface PassageLocation {
  endPage: number;
  startPage: number;
}

const VERSE_METADATA_PATH = path.resolve("data/seed/verse_metadata.json");

let cachedVersePages: Promise<Map<string, number>> | null = null;

function isMushafPage(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 604
  );
}

async function loadVersePages(): Promise<Map<string, number>> {
  const raw = await readFile(VERSE_METADATA_PATH, "utf-8");
  const parsed = JSON.parse(raw) as VerseMetadataDataset;
  const entries = Object.entries(parsed.verses ?? {})
    .filter((entry): entry is [string, VerseMetadataRow & { page_number: number }] =>
      isMushafPage(entry[1].page_number),
    )
    .map(([ayahKey, row]) => [ayahKey, row.page_number] as const);

  return new Map(entries);
}

function getVersePages(): Promise<Map<string, number>> {
  cachedVersePages ??= loadVersePages();
  return cachedVersePages;
}

export function buildAyahKeysForRange(
  surah: number,
  startAyah: number,
  endAyah: number,
): string[] {
  if (
    !Number.isInteger(surah) ||
    !Number.isInteger(startAyah) ||
    !Number.isInteger(endAyah) ||
    surah < 1 ||
    surah > 114 ||
    startAyah < 1 ||
    endAyah < startAyah
  ) {
    return [];
  }

  return Array.from(
    { length: endAyah - startAyah + 1 },
    (_, index) => `${surah}:${startAyah + index}`,
  );
}

export async function resolvePassageLocation(
  surah: number,
  startAyah: number,
  endAyah: number,
): Promise<PassageLocation | null> {
  const ayahKeys = buildAyahKeysForRange(surah, startAyah, endAyah);
  if (ayahKeys.length === 0) {
    return null;
  }

  const versePages = await getVersePages();
  const startPage = versePages.get(ayahKeys[0]);
  const endPage = versePages.get(ayahKeys[ayahKeys.length - 1]);

  if (!isMushafPage(startPage) || !isMushafPage(endPage)) {
    return null;
  }

  return { startPage, endPage };
}
