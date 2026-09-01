interface ResolveThemeChunkLabelParams {
  surahId: number;
  startAyah: number;
  endAyah: number;
  labelBm?: string | null;
  themeNameBm?: string | null;
}

interface ResolveThemeChunkLabelEnParams {
  surahId: number;
  startAyah: number;
  endAyah: number;
  labelEn?: string | null;
  themeNameEn?: string | null;
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

const EN_LABEL_OVERRIDES = new Map<string, string>([
  [
    "supplication to allah for guidance taught by allah himself",
    "A prayer for guidance",
  ],
]);

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

export function resolveThemeChunkLabelEn(
  params: ResolveThemeChunkLabelEnParams,
): string | null {
  const candidate = params.labelEn ?? params.themeNameEn;
  if (!candidate) {
    return null;
  }

  const normalized = collapseWhitespace(candidate);
  if (!normalized || PLACEHOLDER_LABELS.has(normalized.toLowerCase())) {
    return null;
  }

  return EN_LABEL_OVERRIDES.get(normalized.toLowerCase()) ?? normalized;
}
