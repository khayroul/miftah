#!/usr/bin/env tsx

import dotenv from "dotenv";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

dotenv.config({ path: resolve(process.cwd(), ".env.local") });
dotenv.config();

type ThemeChunk = {
  id?: number;
  source_chunk_id?: number | null;
  surah_id: number;
  ayah_from: number;
  ayah_to: number;
  theme: string;
  theme_bm?: string | null;
};

type BatchResponse = {
  translations: Array<{
    id: string;
    bm: string;
  }>;
};

const DEFAULT_INPUT = resolve(process.cwd(), "data/seed/ayah_theme_chunks.json");
const DEFAULT_FULL_INPUT = resolve(process.cwd(), "data/qul/ayah_theme_chunks.full.json");

function cleanText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < 0 || end <= start) {
    return null;
  }
  return text.slice(start, end + 1);
}

async function translateBatch(
  model: string,
  apiKey: string,
  batch: Array<{ id: string; en: string }>,
): Promise<Map<string, string>> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      max_tokens: 2200,
      messages: [
        {
          role: "system",
          content:
            "Anda penterjemah tema Al-Quran. Terjemah English -> Bahasa Melayu (Malaysia), ringkas, jelas, sopan agama. Kekalkan maksud asal. Pulangkan JSON SAHAJA dengan format: {\"translations\":[{\"id\":\"...\",\"bm\":\"...\"}]}.",
        },
        {
          role: "user",
          content: JSON.stringify({ items: batch }),
        },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI request failed (${response.status}): ${body.slice(0, 400)}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("OpenAI returned empty content.");
  }

  const jsonText = extractJsonObject(content);
  if (!jsonText) {
    throw new Error(`Failed to parse JSON from model output: ${content.slice(0, 200)}`);
  }

  const parsed = JSON.parse(jsonText) as BatchResponse;
  if (!parsed || !Array.isArray(parsed.translations)) {
    throw new Error("Model JSON missing translations array.");
  }

  const map = new Map<string, string>();
  for (const item of parsed.translations) {
    const id = cleanText(String(item?.id ?? ""));
    const bm = cleanText(String(item?.bm ?? ""));
    if (!id || !bm) continue;
    map.set(id, bm);
  }
  return map;
}

async function loadJsonArray(path: string): Promise<ThemeChunk[]> {
  const raw = await readFile(path, "utf-8");
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error(`Expected JSON array in ${path}`);
  }
  return parsed as ThemeChunk[];
}

async function main(): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY not set.");
  }

  const model = process.env.OPENAI_THEME_MODEL || "gpt-4.1-mini";
  const batchSize = Math.max(10, Number.parseInt(process.env.THEME_TRANSLATE_BATCH || "35", 10));
  const inputPath = process.argv[2] ? resolve(process.argv[2]) : DEFAULT_INPUT;

  const chunks = await loadJsonArray(inputPath);
  const uniqueThemes = new Map<string, string>();
  for (const row of chunks) {
    const en = cleanText(String(row.theme ?? ""));
    const bm = cleanText(String(row.theme_bm ?? ""));
    if (!en || bm) continue;
    uniqueThemes.set(en, en);
  }

  const missingThemes = Array.from(uniqueThemes.keys());
  if (missingThemes.length === 0) {
    console.log(`[translate] no missing theme_bm in ${inputPath}`);
    return;
  }

  console.log(`[translate] input=${inputPath}`);
  console.log(`[translate] model=${model}, batch_size=${batchSize}, missing_themes=${missingThemes.length}`);

  const batches = chunkArray(
    missingThemes.map((en, idx) => ({ id: String(idx + 1), en })),
    batchSize,
  );

  const translationByTheme = new Map<string, string>();
  let translatedCount = 0;

  for (let i = 0; i < batches.length; i += 1) {
    const batch = batches[i];
    const result = await translateBatch(model, apiKey, batch);

    for (const item of batch) {
      const bm = result.get(item.id);
      if (!bm) continue;
      translationByTheme.set(item.en, bm);
      translatedCount += 1;
    }

    console.log(`[translate] batch ${i + 1}/${batches.length} done, translated=${translatedCount}/${missingThemes.length}`);
  }

  const merged = chunks.map((row) => {
    const en = cleanText(String(row.theme ?? ""));
    const existingBm = cleanText(String(row.theme_bm ?? ""));
    const translatedBm = translationByTheme.get(en);
    return {
      ...row,
      theme_bm: existingBm || translatedBm || null,
    };
  });

  await writeFile(inputPath, `${JSON.stringify(merged, null, 2)}\n`, "utf-8");
  console.log(`[translate] wrote ${inputPath}`);

  if (existsSync(DEFAULT_FULL_INPUT)) {
    const fullData = await loadJsonArray(DEFAULT_FULL_INPUT);
    const updatedFull = fullData.map((row) => {
      const en = cleanText(String(row.theme ?? ""));
      const existingBm = cleanText(String(row.theme_bm ?? ""));
      const translatedBm = translationByTheme.get(en);
      return {
        ...row,
        theme_bm: existingBm || translatedBm || null,
      };
    });
    await writeFile(DEFAULT_FULL_INPUT, `${JSON.stringify(updatedFull, null, 2)}\n`, "utf-8");
    console.log(`[translate] wrote ${DEFAULT_FULL_INPUT}`);
  }

  const stillMissing = merged.filter((row) => !cleanText(String(row.theme_bm ?? ""))).length;
  console.log(`[translate] done. missing_theme_bm_rows=${stillMissing}`);
}

main().catch((err) => {
  console.error("[translate] failed:", err.message);
  process.exit(1);
});
