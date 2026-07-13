import { readFile } from "node:fs/promises";
import path from "node:path";
import type { MushafLayoutLine, MushafLayoutPage } from "@/mushaf/types/mushafLayout";

interface SurahMetaEntry {
  name_ar: string;
  name_en: string;
  ayas: number;
}

const LAYOUT_DIR = path.join(process.cwd(), "data", "mushaf-layout", "mushaf");
const BASMALA_GLYPHS_QPC2 = "\uFB51\uFB52\uFB53";

export async function loadMushafLayout(
  pageNumber: number,
): Promise<MushafLayoutPage | null> {
  const padded = String(pageNumber).padStart(3, "0");
  const filePath = path.join(LAYOUT_DIR, `page-${padded}.json`);
  try {
    const raw = await readFile(filePath, "utf-8");
    return JSON.parse(raw) as MushafLayoutPage;
  } catch {
    return null;
  }
}

function parseVerseRef(ref: string): { surah: number; ayah: number } | null {
  if (!ref.includes(":")) return null;
  const [s, a] = ref.split(":").map(Number);
  if (!Number.isFinite(s) || !Number.isFinite(a)) return null;
  return { surah: s, ayah: a };
}

export function normalizeLayoutForRender(
  layout: MushafLayoutPage,
  surahMeta: Record<number, SurahMetaEntry>,
): MushafLayoutPage {
  if (!layout || !Array.isArray(layout.lines)) return layout;
  const lines = layout.lines.map((line) => ({ ...line }));

  const hasBasmala = lines.some((line) => line.type === "basmala");
  const firstTextLine = lines.find(
    (line) => line.type === "text" && typeof line.verseRange === "string",
  );
  if (!firstTextLine || !firstTextLine.verseRange) return { ...layout, lines };

  const startRef = firstTextLine.verseRange.split("-")[0];
  const startVerse = parseVerseRef(startRef);

  const hasHeaderForStartSurah =
    startVerse &&
    lines.some(
      (line) =>
        line.type === "surah-header" &&
        parseInt(line.surah || "0", 10) === startVerse.surah,
    );

  if (startVerse && startVerse.ayah === 1 && !hasHeaderForStartSurah) {
    const prefix: MushafLayoutLine[] = [];
    prefix.push({
      type: "surah-header",
      text: surahMeta[startVerse.surah]?.name_ar || "",
      surah: String(startVerse.surah).padStart(3, "0"),
    });

    if (!hasBasmala && startVerse.surah !== 1 && startVerse.surah !== 9) {
      prefix.push({
        type: "basmala",
        qpcV2: BASMALA_GLYPHS_QPC2,
      });
    }

    return { ...layout, lines: [...prefix, ...lines] };
  }

  return { ...layout, lines };
}

