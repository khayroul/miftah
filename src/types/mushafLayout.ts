export interface MushafLayoutWord {
  location: string;
  word: string;
  qpcV2: string;
  qpcV1?: string;
}

export interface MushafLayoutLine {
  line?: number;
  type: "text" | "surah-header" | "basmala";
  text?: string;
  verseRange?: string;
  surah?: string;
  qpcV2?: string;
  qpcV1?: string;
  words?: MushafLayoutWord[];
}

export interface MushafLayoutPage {
  page: number;
  lines: MushafLayoutLine[];
}

export function computeLastLineFlags(lines: MushafLayoutLine[]): Set<number> {
  const lastLineIndexes = new Set<number>();
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].type !== "text") continue;

    let isLastLine = false;
    for (let j = i + 1; j < lines.length; j++) {
      if (lines[j].type === "text") break;
      if (lines[j].type === "surah-header") {
        isLastLine = true;
        break;
      }
    }

    if (!isLastLine) {
      const hasMoreText = lines.slice(i + 1).some((l) => l.type === "text");
      if (!hasMoreText) isLastLine = true;
    }

    const wordCount = (lines[i].words || []).length;
    if (isLastLine && wordCount <= 5) lastLineIndexes.add(i);
  }

  return lastLineIndexes;
}
