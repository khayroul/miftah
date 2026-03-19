import { readdirSync, copyFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const SOURCE_DIR = path.join(process.cwd(), "data", "mushaf-layout", "mushaf");
const OUTPUT_DIR = path.join(process.cwd(), "public", "layouts");

function main(): void {
  const files = readdirSync(SOURCE_DIR)
    .filter((f) => f.startsWith("page-") && f.endsWith(".json"));

  if (files.length !== 604) {
    throw new Error(`Expected 604 layout files, found ${files.length}`);
  }

  mkdirSync(OUTPUT_DIR, { recursive: true });

  for (const file of files) {
    copyFileSync(path.join(SOURCE_DIR, file), path.join(OUTPUT_DIR, file));
  }

  console.log(`Copied ${files.length} layout files to ${OUTPUT_DIR}`);
}

main();
