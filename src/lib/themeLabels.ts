interface ResolveThemeChunkLabelParams {
  surahId: number;
  startAyah: number;
  endAyah: number;
  labelBm?: string | null;
  themeNameBm?: string | null;
}

const PLACEHOLDER_LABELS = new Set([
  "tanpa tema",
  "unthemed",
  "no theme",
  "manual chunk",
  "chunk manual",
]);

const BM_NORMALIZATION_RULES: Array<[RegExp, string]> = [
  [/\bJews?\b/gi, "Yahudi"],
  [/\bChristians?\b/gi, "Nasrani"],
  [/\s*vs\.?\s*/gi, " berbanding "],
  [/\s*&\s*/g, " dan "],
  [/\band\b/gi, "dan"],
];

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeLabel(value: string): string {
  let normalized = collapseWhitespace(value);
  for (const [pattern, replacement] of BM_NORMALIZATION_RULES) {
    normalized = normalized.replace(pattern, replacement);
  }
  normalized = normalized.replace(/\s+([,.;:!?])/g, "$1");
  return collapseWhitespace(normalized);
}

function sanitizeCandidate(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = normalizeLabel(value);
  if (!normalized) {
    return null;
  }

  const key = normalized.toLowerCase();
  if (PLACEHOLDER_LABELS.has(key)) {
    return null;
  }

  return normalized;
}

function formatAyahRange(
  surahId: number,
  startAyah: number,
  endAyah: number,
): string {
  if (startAyah === endAyah) {
    return `${surahId}:${startAyah}`;
  }
  return `${surahId}:${startAyah}-${endAyah}`;
}

export function resolveThemeChunkLabelBm(
  params: ResolveThemeChunkLabelParams,
): string {
  const directLabel =
    sanitizeCandidate(params.labelBm) ??
    sanitizeCandidate(params.themeNameBm);
  if (directLabel) {
    return directLabel;
  }

  return `Fokus ayat ${formatAyahRange(
    params.surahId,
    params.startAyah,
    params.endAyah,
  )}`;
}
