#!/usr/bin/env tsx

import dotenv from "dotenv";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: resolve(process.cwd(), ".env.local") });
dotenv.config();

type ThemeSeedRow = {
  id: number;
  name_bm?: string | null;
};

function asPositiveInt(value: unknown): number | null {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return null;
  }
  const intVal = Math.trunc(num);
  return intVal > 0 ? intVal : null;
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

async function main(): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }

  const inputPath = process.argv[2]
    ? resolve(process.argv[2])
    : resolve(process.cwd(), "data/seed/themes.json");
  const batchSize = Math.max(
    100,
    Number.parseInt(process.env.THEMES_SYNC_BATCH || "500", 10),
  );

  const raw = await readFile(inputPath, "utf-8");
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error(`Expected JSON array in ${inputPath}`);
  }

  const rows = (parsed as ThemeSeedRow[])
    .map((row) => {
      const id = asPositiveInt(row.id);
      if (!id) {
        return null;
      }
      const nameBm = cleanText(String(row.name_bm ?? ""));
      return {
        id,
        name_bm: nameBm || null,
      };
    })
    .filter(
      (
        row,
      ): row is {
        id: number;
        name_bm: string | null;
      } => row !== null,
    );

  if (rows.length === 0) {
    throw new Error("No valid theme rows found.");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  console.log(`[themes-sync] input=${inputPath}`);
  console.log(`[themes-sync] rows=${rows.length}, batch_size=${batchSize}`);

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(async (row) => {
        const { error } = await supabase
          .from("themes")
          .update({ name_bm: row.name_bm })
          .eq("id", row.id);
        if (error) {
          throw new Error(`id=${row.id}: ${error.message}`);
        }
      }),
    );
    if (results.length < 0) {
      throw new Error("Unexpected empty batch update result.");
    }
    console.log(
      `[themes-sync] updated ${Math.min(i + batch.length, rows.length)}/${rows.length}`,
    );
  }

  console.log("[themes-sync] complete.");
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[themes-sync] failed: ${message}`);
  process.exit(1);
});
