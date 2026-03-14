import dotenv from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

dotenv.config({ path: ".env.local" });

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(THIS_DIR, "../..");
const PAGES_DIR = path.join(PROJECT_ROOT, "assets/pages");
const MANIFESTS_DIR = path.join(PROJECT_ROOT, "assets/manifests");

const DEFAULT_PAGES_BUCKET = "mushaf-pages";
const DEFAULT_MANIFESTS_BUCKET = "mushaf-manifests";
const PAGE_REGEX = /^page_\d{3}\.png$/;
const THUMB_REGEX = /^page_\d{3}_thumb\.png$/;
const MOBILE_REGEX = /^page_\d{3}_mobile\.webp$/;
const MANIFEST_REGEX = /^page_\d{3}\.manifest\.json$/;

interface UploadItem {
  bucket: string;
  localPath: string;
  objectPath: string;
  contentType: string;
}

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

function parseBoolean(value: string | undefined, fallback = false): boolean {
  if (!value) {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function getArgValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx < 0 || idx + 1 >= process.argv.length) {
    return undefined;
  }
  return process.argv[idx + 1];
}

function hasArg(flag: string): boolean {
  return process.argv.includes(flag);
}

async function ensureBucketPublic(
  supabase: SupabaseClient,
  bucketName: string,
): Promise<void> {
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) {
    throw new Error(`Failed to list buckets: ${listError.message}`);
  }

  const exists = (buckets ?? []).some(
    (bucket) => bucket.name === bucketName || bucket.id === bucketName,
  );

  if (!exists) {
    const { error: createError } = await supabase.storage.createBucket(bucketName, {
      public: true,
    });
    if (createError) {
      throw new Error(
        `Failed to create bucket "${bucketName}": ${createError.message}`,
      );
    }
    console.log(`[bucket] created ${bucketName}`);
    return;
  }

  const { error: updateError } = await supabase.storage.updateBucket(bucketName, {
    public: true,
  });
  if (updateError) {
    throw new Error(`Failed to set bucket "${bucketName}" public: ${updateError.message}`);
  }
  console.log(`[bucket] ready ${bucketName} (public)`);
}

async function collectUploadItems(
  pagesBucket: string,
  manifestsBucket: string,
  includePages: boolean,
  includeThumbs: boolean,
  includeMobile: boolean,
  includeManifests: boolean,
): Promise<UploadItem[]> {
  const pageEntries = (await readdir(PAGES_DIR)).sort();
  const manifestEntries = (await readdir(MANIFESTS_DIR)).sort();

  const items: UploadItem[] = [];
  let pagesCount = 0;
  let thumbsCount = 0;
  let mobileCount = 0;
  let manifestsCount = 0;

  for (const entry of pageEntries) {
    if (includePages && PAGE_REGEX.test(entry)) {
      pagesCount += 1;
      items.push({
        bucket: pagesBucket,
        localPath: path.join(PAGES_DIR, entry),
        objectPath: entry,
        contentType: "image/png",
      });
      continue;
    }

    if (includeThumbs && THUMB_REGEX.test(entry)) {
      thumbsCount += 1;
      items.push({
        bucket: pagesBucket,
        localPath: path.join(PAGES_DIR, entry),
        objectPath: entry,
        contentType: "image/png",
      });
      continue;
    }

    if (includeMobile && MOBILE_REGEX.test(entry)) {
      mobileCount += 1;
      items.push({
        bucket: pagesBucket,
        localPath: path.join(PAGES_DIR, entry),
        objectPath: entry,
        contentType: "image/webp",
      });
    }
  }

  if (!includeManifests) {
    console.log(
      `[scan] pages=${pagesCount}, thumbs=${thumbsCount}, mobile=${mobileCount}, manifests=0`,
    );
    return items;
  }

  for (const entry of manifestEntries) {
    if (!MANIFEST_REGEX.test(entry)) {
      continue;
    }
    manifestsCount += 1;
    items.push({
      bucket: manifestsBucket,
      localPath: path.join(MANIFESTS_DIR, entry),
      objectPath: entry,
      contentType: "application/json",
    });
  }

  console.log(
    `[scan] pages=${pagesCount}, thumbs=${thumbsCount}, mobile=${mobileCount}, manifests=${manifestsCount}`,
  );
  return items;
}

async function uploadItems(
  supabase: SupabaseClient,
  items: UploadItem[],
  concurrency: number,
  upsert: boolean,
): Promise<void> {
  if (items.length === 0) {
    console.log("[upload] no files to upload");
    return;
  }

  let nextIndex = 0;
  let completed = 0;
  let failed = 0;
  const failures: string[] = [];

  const workerCount = Math.min(concurrency, items.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;

      if (currentIndex >= items.length) {
        return;
      }

      const item = items[currentIndex];
      try {
        const bytes = await readFile(item.localPath);
        const { error } = await supabase.storage.from(item.bucket).upload(
          item.objectPath,
          bytes,
          {
            upsert,
            contentType: item.contentType,
            cacheControl: "31536000",
          },
        );

        if (error) {
          throw new Error(error.message);
        }
      } catch (err) {
        failed += 1;
        failures.push(`${item.bucket}/${item.objectPath}: ${String(err)}`);
      } finally {
        completed += 1;
        if (completed % 50 === 0 || completed === items.length) {
          console.log(
            `[upload] ${completed}/${items.length} completed (failed=${failed})`,
          );
        }
      }
    }
  });

  await Promise.all(workers);

  if (failed > 0) {
    for (const line of failures.slice(0, 15)) {
      console.error(`[error] ${line}`);
    }
    throw new Error(`Upload finished with ${failed} failure(s).`);
  }
}

async function main(): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local",
    );
  }

  const pagesBucket = process.env.MUSHAF_PAGES_BUCKET?.trim() || DEFAULT_PAGES_BUCKET;
  const manifestsBucket =
    process.env.MUSHAF_MANIFESTS_BUCKET?.trim() || DEFAULT_MANIFESTS_BUCKET;

  const onlyMobile = hasArg("--only-mobile");
  const includePages = onlyMobile ? false : !hasArg("--no-pages");
  const includeThumbs = onlyMobile ? false : !hasArg("--no-thumbs");
  const includeMobile = !hasArg("--no-mobile");
  const includeManifests = onlyMobile ? false : !hasArg("--no-manifests");
  const dryRun = hasArg("--dry-run");
  const upsert = parseBoolean(process.env.MUSHAF_UPLOAD_UPSERT, true);
  const concurrency = parsePositiveInt(
    getArgValue("--concurrency") ?? process.env.MUSHAF_UPLOAD_CONCURRENCY,
    8,
  );

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  await ensureBucketPublic(supabase, pagesBucket);
  await ensureBucketPublic(supabase, manifestsBucket);

  const items = await collectUploadItems(
    pagesBucket,
    manifestsBucket,
    includePages,
    includeThumbs,
    includeMobile,
    includeManifests,
  );
  console.log(
    `[plan] upload_count=${items.length}, concurrency=${concurrency}, upsert=${upsert}, dry_run=${dryRun}`,
  );

  if (!dryRun) {
    await uploadItems(supabase, items, concurrency, upsert);
    console.log("[done] Upload complete.");
  }

  const normalizedUrl = trimTrailingSlashes(supabaseUrl);
  console.log("\nSet these env vars for web + bot:");
  console.log(`MUSHAF_CDN_ENABLED=true`);
  console.log(
    `MUSHAF_PAGES_BASE_URL=${normalizedUrl}/storage/v1/object/public/${pagesBucket}`,
  );
  console.log(
    `MUSHAF_MANIFESTS_BASE_URL=${normalizedUrl}/storage/v1/object/public/${manifestsBucket}`,
  );
}

main().catch((err) => {
  console.error(`[fatal] ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
