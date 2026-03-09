#!/usr/bin/env tsx

import dotenv from "dotenv";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: resolve(process.cwd(), ".env.local") });
dotenv.config();

type AyahThemeChunk = {
  source_chunk_id?: number | null;
  surah_id: number;
  ayah_from: number;
  ayah_to: number;
  verse_key_from?: string | null;
  verse_key_to?: string | null;
  verses_count?: number | null;
  theme: string;
  theme_bm?: string | null;
  keywords?: string[] | null;
  book_id?: number | null;
};

function asInt(value: unknown, fallback = 0): number {
  const num = Number(value);
  return Number.isFinite(num) ? Math.trunc(num) : fallback;
}

function syntheticSourceChunkId(surahId: number, ayahFrom: number, ayahTo: number): number {
  return -(surahId * 1_000_000 + ayahFrom * 1_000 + ayahTo);
}

async function main(): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.");
  }

  const inputPathArg = process.argv[2];
  const inputPath = inputPathArg
    ? resolve(inputPathArg)
    : resolve(process.cwd(), "data/seed/ayah_theme_chunks.json");
  const batchSize = Math.max(100, asInt(process.env.AYAH_THEME_SYNC_BATCH, 500));

  const raw = await readFile(inputPath, "utf-8");
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error(`Expected array JSON in ${inputPath}`);
  }

  const rows = (parsed as AyahThemeChunk[])
    .map((chunk) => {
      const surahId = asInt(chunk.surah_id);
      const ayahFrom = asInt(chunk.ayah_from);
      const ayahTo = asInt(chunk.ayah_to);
      const sourceChunkIdRaw = asInt(chunk.source_chunk_id, 0);
      const sourceChunkId =
        sourceChunkIdRaw > 0
          ? sourceChunkIdRaw
          : syntheticSourceChunkId(surahId, ayahFrom, ayahTo);

      return {
        source_chunk_id: sourceChunkId,
        surah_id: surahId,
        ayah_from: ayahFrom,
        ayah_to: ayahTo,
        verse_key_from: chunk.verse_key_from ?? `${surahId}:${ayahFrom}`,
        verse_key_to: chunk.verse_key_to ?? `${surahId}:${ayahTo}`,
        verses_count: chunk.verses_count ?? Math.max(1, ayahTo - ayahFrom + 1),
        theme: String(chunk.theme ?? "").trim(),
        theme_bm: String(chunk.theme_bm ?? "").trim() || null,
        keywords: Array.isArray(chunk.keywords)
          ? chunk.keywords
              .map((k) => String(k).trim())
              .filter((k) => k.length > 0)
          : [],
        book_id:
          chunk.book_id !== null && chunk.book_id !== undefined
            ? asInt(chunk.book_id, 0) || null
            : null,
      };
    })
    .filter((row) => row.surah_id > 0 && row.ayah_from > 0 && row.ayah_to >= row.ayah_from && row.theme);

  if (rows.length === 0) {
    throw new Error("No valid ayah theme chunks to sync.");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const ping = await supabase
    .from("ayah_theme_chunks")
    .select("id", { head: true, count: "exact" })
    .limit(1);

  if (ping.error) {
    throw new Error(
      `Unable to access ayah_theme_chunks table. Apply migration first. Details: ${ping.error.message}`,
    );
  }

  console.log(`[sync] input=${inputPath}`);
  console.log(`[sync] rows=${rows.length}, batch_size=${batchSize}`);

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabase
      .from("ayah_theme_chunks")
      .upsert(batch, { onConflict: "source_chunk_id" });
    if (error) {
      throw new Error(`Batch upsert failed at offset ${i}: ${error.message}`);
    }

    const end = Math.min(i + batch.length, rows.length);
    console.log(`[sync] upserted ${end}/${rows.length}`);
  }

  const { count, error: countError } = await supabase
    .from("ayah_theme_chunks")
    .select("id", { head: true, count: "exact" });
  if (countError) {
    throw new Error(`Count query failed: ${countError.message}`);
  }

  console.log(`[sync] complete. table_count=${count ?? 0}`);
}

main().catch((err) => {
  console.error("[sync] failed:", err.message);
  process.exit(1);
});
