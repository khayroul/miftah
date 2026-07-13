import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ThemeChunkOverride } from "./tema-types";

const THEME_CHUNK_OVERRIDES_PATH = path.resolve(
  "data/theme_chunk_overrides.json",
);

let themeChunkOverridesCachePromise: Promise<Record<string, unknown[]>> | null =
  null;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function parsePositiveInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return null;
}

function parseOptionalInt(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  return parsePositiveInt(value);
}

function parseOptionalString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function parseThemeChunkOverride(
  value: unknown,
  maxAyah: number,
): ThemeChunkOverride | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const startAyah = parsePositiveInt(record.start_ayah);
  const rawEndAyah = parsePositiveInt(record.end_ayah);
  if (!startAyah || !rawEndAyah || startAyah > maxAyah) {
    return null;
  }

  const endAyah = Math.min(rawEndAyah, maxAyah);
  if (startAyah > endAyah) {
    return null;
  }

  return {
    start_ayah: startAyah,
    end_ayah: endAyah,
    theme_id: parseOptionalInt(record.theme_id),
    label_bm: parseOptionalString(record.label_bm),
    label_en: parseOptionalString(record.label_en),
    synopsis_bm: parseOptionalString(record.synopsis_bm),
  };
}

export function normalizeSurahOverrides(
  rawOverrides: unknown[] | undefined,
  maxAyah: number,
): ThemeChunkOverride[] {
  if (!rawOverrides || rawOverrides.length === 0) {
    return [];
  }

  const parsed = rawOverrides
    .map((item) => parseThemeChunkOverride(item, maxAyah))
    .filter((item): item is ThemeChunkOverride => item !== null)
    .sort((a, b) => {
      if (a.start_ayah !== b.start_ayah) {
        return a.start_ayah - b.start_ayah;
      }
      return a.end_ayah - b.end_ayah;
    });

  const deduped: ThemeChunkOverride[] = [];
  let previousEndAyah = 0;
  for (const override of parsed) {
    if (override.start_ayah <= previousEndAyah) {
      continue;
    }
    deduped.push(override);
    previousEndAyah = override.end_ayah;
  }
  return deduped;
}

async function loadThemeChunkOverridesMap(): Promise<Record<string, unknown[]>> {
  if (!themeChunkOverridesCachePromise) {
    themeChunkOverridesCachePromise = (async () => {
      try {
        const raw = await readFile(THEME_CHUNK_OVERRIDES_PATH, "utf-8");
        const parsed: unknown = JSON.parse(raw);
        const record = asRecord(parsed);
        if (!record) {
          return {};
        }

        const normalized: Record<string, unknown[]> = {};
        for (const [key, value] of Object.entries(record)) {
          if (Array.isArray(value)) {
            normalized[key] = value;
          }
        }
        return normalized;
      } catch {
        return {};
      }
    })();
  }
  return themeChunkOverridesCachePromise;
}

export async function loadSurahThemeChunkOverrides(
  surahId: number,
  maxAyah: number,
): Promise<ThemeChunkOverride[]> {
  const overrideMap = await loadThemeChunkOverridesMap();
  return normalizeSurahOverrides(overrideMap[String(surahId)], maxAyah);
}
