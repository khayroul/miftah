#!/usr/bin/env tsx

import dotenv from "dotenv";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

dotenv.config({ path: resolve(process.cwd(), ".env.local") });
dotenv.config();

type ChunkRow = {
  id?: number;
  theme: string;
  theme_bm?: string | null;
};

type ThemeRow = {
  id: number;
  name_en?: string | null;
  name_bm?: string | null;
  description_en?: string | null;
};

type TranslationItem = {
  id: string;
  bm: string;
};

type TranslationResponse = {
  translations: TranslationItem[];
};

type PromptItem = {
  id: string;
  text: string;
  context: string;
};

const CHUNKS_PATH = resolve(process.cwd(), "data/seed/ayah_theme_chunks.json");
const CHUNKS_FULL_PATH = resolve(
  process.cwd(),
  "data/qul/ayah_theme_chunks.full.json",
);
const THEMES_PATH = resolve(process.cwd(), "data/seed/themes.json");

const DEFAULT_MODEL = process.env.OPENAI_THEME_MODEL || "gpt-4.1-mini";
const DEFAULT_BATCH_SIZE = Math.max(
  20,
  Number.parseInt(process.env.THEME_REWRITE_BATCH || "35", 10),
);
const DEFAULT_SLEEP_MS = Math.max(
  0,
  Number.parseInt(process.env.THEME_REWRITE_SLEEP_MS || "250", 10),
);

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function stripCodeFence(value: string): string {
  const text = value.trim();
  if (!text.startsWith("```")) {
    return text;
  }

  const lines = text.split("\n");
  if (lines.length < 3) {
    return text.replace(/```/g, "");
  }
  return lines.slice(1, lines.length - 1).join("\n").trim();
}

function extractJson(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < 0 || end <= start) {
    return null;
  }
  return text.slice(start, end + 1);
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

async function loadJsonArray<T>(path: string): Promise<T[]> {
  const raw = await readFile(path, "utf-8");
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error(`Expected JSON array in ${path}`);
  }
  return parsed as T[];
}

function buildPrompt(items: PromptItem[]): Array<{ role: string; content: string }> {
  const system = [
    "Anda editor Bahasa Melayu (Malaysia) untuk aplikasi Quran.",
    "Tugas: tulis semula label tema supaya bunyinya semula jadi, ringkas, dan beradab Islam.",
    "Elakkan terjemahan literal yang janggal.",
    "Peraturan:",
    "1) Bahasa mestilah BM Malaysia, bukan Inggeris atau Perancis.",
    "2) Kekalkan nama khas Islam (contoh: Allah, Musa, Isa, Maryam, Ibrahim, Fir'aun, Iblis, Kaabah).",
    "3) Gaya label pendek (biasanya 2-8 perkataan), sesuai sebagai tajuk tema.",
    "4) Jika input generik seperti 'Topic N', guna 'Tema N'.",
    "5) Jika ada 'vs', ubah kepada frasa BM semula jadi seperti 'berbanding'.",
    'Pulangkan JSON SAHAJA dengan format: {"translations":[{"id":"...","bm":"..."}]}',
  ].join("\n");

  const user = JSON.stringify(
    {
      items,
      instruction:
        "Setiap bm mestilah frasa BM yang natural, bukan campuran bahasa.",
    },
    null,
    2,
  );

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

async function translateBatch(
  apiKey: string,
  model: string,
  items: PromptItem[],
): Promise<Map<string, string>> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.15,
      max_tokens: 3000,
      messages: buildPrompt(items),
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI error (${response.status}): ${body.slice(0, 500)}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("OpenAI returned empty content.");
  }

  const cleaned = stripCodeFence(content);
  const jsonText = extractJson(cleaned);
  if (!jsonText) {
    throw new Error(`Model output missing JSON object: ${cleaned.slice(0, 300)}`);
  }

  const parsed = JSON.parse(jsonText) as TranslationResponse;
  if (!parsed || !Array.isArray(parsed.translations)) {
    throw new Error("Invalid JSON schema from model.");
  }

  const map = new Map<string, string>();
  for (const item of parsed.translations) {
    const id = cleanText(String(item?.id ?? ""));
    const bm = cleanText(String(item?.bm ?? ""));
    if (!id || !bm) {
      continue;
    }
    map.set(id, bm);
  }
  return map;
}

function detectNonBmArtifacts(value: string): boolean {
  const text = value.trim();
  if (!text) {
    return true;
  }

  const lower = text.toLowerCase();
  if (/\btopic\s+\d+\b/i.test(lower)) {
    return true;
  }
  if (/\b(vs\.?|and)\b/i.test(lower)) {
    return true;
  }
  if (/\b(jews?|christians?)\b/i.test(lower)) {
    return true;
  }
  if (/[À-ÿ]/.test(text)) {
    return true;
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

async function run(): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set.");
  }

  const [chunks, themes] = await Promise.all([
    loadJsonArray<ChunkRow>(CHUNKS_PATH),
    loadJsonArray<ThemeRow>(THEMES_PATH),
  ]);

  const itemBySource = new Map<string, PromptItem>();

  for (const chunk of chunks) {
    const source = cleanText(String(chunk.theme ?? ""));
    if (!source) {
      continue;
    }
    if (!itemBySource.has(source)) {
      itemBySource.set(source, {
        id: String(itemBySource.size + 1),
        text: source,
        context: "chunk_theme",
      });
    }
  }

  for (const theme of themes) {
    const source = cleanText(
      String(theme.name_en ?? theme.name_bm ?? ""),
    );
    if (!source) {
      continue;
    }
    if (!itemBySource.has(source)) {
      const desc = cleanText(String(theme.description_en ?? ""));
      itemBySource.set(source, {
        id: String(itemBySource.size + 1),
        text: source,
        context: desc ? `theme_name|${desc.slice(0, 180)}` : "theme_name",
      });
    }
  }

  const allItems = Array.from(itemBySource.values());
  const batches = chunkArray(allItems, DEFAULT_BATCH_SIZE);
  const translationBySource = new Map<string, string>();

  console.log(
    `[rewrite] model=${DEFAULT_MODEL} batch_size=${DEFAULT_BATCH_SIZE} items=${allItems.length}`,
  );

  for (let i = 0; i < batches.length; i += 1) {
    const batch = batches[i];
    let attempts = 0;
    let translated = new Map<string, string>();

    while (attempts < 3) {
      attempts += 1;
      try {
        translated = await translateBatch(apiKey, DEFAULT_MODEL, batch);
        break;
      } catch (error) {
        if (attempts >= 3) {
          throw error;
        }
        await sleep(1200 * attempts);
      }
    }

    const batchIdToSource = new Map(batch.map((entry) => [entry.id, entry.text]));
    for (const [id, bm] of translated.entries()) {
      const source = batchIdToSource.get(id);
      if (!source) {
        continue;
      }
      translationBySource.set(source, cleanText(bm));
    }

    console.log(
      `[rewrite] batch ${i + 1}/${batches.length} done, translated=${translationBySource.size}/${allItems.length}`,
    );
    await sleep(DEFAULT_SLEEP_MS);
  }

  const rewriteChunkRow = (row: ChunkRow): ChunkRow => {
    const source = cleanText(String(row.theme ?? ""));
    const translated = translationBySource.get(source);
    const existingBm = cleanText(String(row.theme_bm ?? ""));
    return {
      ...row,
      theme_bm: (translated ?? existingBm) || null,
    };
  };

  const rewriteThemeRow = (row: ThemeRow): ThemeRow => {
    const source = cleanText(String(row.name_en ?? row.name_bm ?? ""));
    const translated = translationBySource.get(source);
    const existingBm = cleanText(String(row.name_bm ?? ""));
    return {
      ...row,
      name_bm: ((translated ?? existingBm) || row.name_bm) || null,
    };
  };

  const rewrittenChunks = chunks.map(rewriteChunkRow);
  const rewrittenThemes = themes.map(rewriteThemeRow);

  await writeFile(CHUNKS_PATH, `${JSON.stringify(rewrittenChunks, null, 2)}\n`, "utf-8");
  await writeFile(THEMES_PATH, `${JSON.stringify(rewrittenThemes, null, 2)}\n`, "utf-8");

  if (existsSync(CHUNKS_FULL_PATH)) {
    const fullChunks = await loadJsonArray<ChunkRow>(CHUNKS_FULL_PATH);
    const rewrittenFull = fullChunks.map(rewriteChunkRow);
    await writeFile(
      CHUNKS_FULL_PATH,
      `${JSON.stringify(rewrittenFull, null, 2)}\n`,
      "utf-8",
    );
  }

  const chunkArtifactCount = rewrittenChunks.filter((row) =>
    detectNonBmArtifacts(String(row.theme_bm ?? "")),
  ).length;
  const themeArtifactCount = rewrittenThemes.filter((row) =>
    detectNonBmArtifacts(String(row.name_bm ?? "")),
  ).length;

  console.log(`[rewrite] wrote ${CHUNKS_PATH}`);
  console.log(`[rewrite] wrote ${THEMES_PATH}`);
  if (existsSync(CHUNKS_FULL_PATH)) {
    console.log(`[rewrite] wrote ${CHUNKS_FULL_PATH}`);
  }
  console.log(`[rewrite] qa chunk_non_bm_artifacts=${chunkArtifactCount}`);
  console.log(`[rewrite] qa theme_non_bm_artifacts=${themeArtifactCount}`);
}

run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[rewrite] failed: ${message}`);
  process.exit(1);
});
