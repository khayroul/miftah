import { existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");
const PAGES_DIR = join(PROJECT_ROOT, "assets", "pages");
const MANIFEST_DIR = join(PROJECT_ROOT, "assets", "manifests");

let missingPages = [];
let missingManifests = [];

for (let i = 1; i <= 604; i++) {
  const pageNum = String(i).padStart(3, "0");
  const pngPath = join(PAGES_DIR, `page_${pageNum}.png`);
  const manifestPath = join(MANIFEST_DIR, `page_${pageNum}.manifest.json`);

  if (!existsSync(pngPath)) missingPages.push(i);
  if (!existsSync(manifestPath)) missingManifests.push(i);
}

if (missingPages.length === 0 && missingManifests.length === 0) {
  console.log("✅ All 604 pages and manifests are present.");
} else {
  if (missingPages.length > 0) {
    console.log(`❌ Missing ${missingPages.length} pages:`, missingPages.slice(0, 10).join(", ") + (missingPages.length > 10 ? "..." : ""));
  }
  if (missingManifests.length > 0) {
    console.log(`❌ Missing ${missingManifests.length} manifests:`, missingManifests.slice(0, 10).join(", ") + (missingManifests.length > 10 ? "..." : ""));
  }
  process.exit(1);
}
