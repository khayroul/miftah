import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getSurah,
  getThemeAppearanceChunksBySurah,
} from "@/lib/queries";
import type { ThemeAppearanceChunk } from "@/lib/queries";
import type { Surah } from "@/types/database";

interface SurahThemeAppearancePageProps {
  params: Promise<{ surah: string }>;
  searchParams: Promise<{ chunk?: string | string[] }>;
}

function parseSurahNumber(value: string): number | null {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 114) {
    return null;
  }
  return parsed;
}

function rangeLabel(
  surahId: number,
  startAyah: number,
  endAyah: number,
): string {
  if (startAyah === endAyah) {
    return `${surahId}:${startAyah}`;
  }
  return `${surahId}:${startAyah}-${endAyah}`;
}

function chunkTitleBm(chunk: ThemeAppearanceChunk): string {
  return chunk.label_bm ?? chunk.theme?.name_bm ?? "Tanpa tema";
}

function chunkTitleEn(chunk: ThemeAppearanceChunk): string {
  return chunk.label_en ?? chunk.theme?.name_en ?? "Unthemed";
}

export default async function SurahThemeAppearancePage({
  params,
  searchParams,
}: SurahThemeAppearancePageProps) {
  const { surah } = await params;
  const query = await searchParams;
  const surahNumber = parseSurahNumber(surah);

  if (!surahNumber) {
    notFound();
  }

  let surahMeta: Surah;
  try {
    surahMeta = await getSurah(surahNumber);
  } catch {
    notFound();
  }

  let chunks: ThemeAppearanceChunk[] = [];
  let loadError: string | null = null;
  try {
    chunks = await getThemeAppearanceChunksBySurah(surahNumber);
  } catch {
    loadError =
      "Data tema belum dapat dimuat sekarang. Sila semak sambungan Supabase dan cuba semula.";
  }

  const rawChunkParam = Array.isArray(query.chunk) ? query.chunk[0] : query.chunk;
  const parsedChunkParam = rawChunkParam
    ? Number.parseInt(rawChunkParam, 10)
    : 1;
  const selectedChunkIndex =
    chunks.length > 0
      ? Number.isInteger(parsedChunkParam)
        ? Math.min(Math.max(parsedChunkParam, 1), chunks.length)
        : 1
      : 1;
  const selectedChunk = chunks[selectedChunkIndex - 1] ?? null;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-medium text-stone-900">
              Theme Appearance View
            </h1>
            <p className="text-sm text-stone-600">
              Surah {surahMeta.id}: {surahMeta.name_en} ({surahMeta.name_arabic})
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href={surahMeta.page_start ? `/read/${surahMeta.page_start}` : "/read/1"}
              className="rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-700 transition hover:bg-stone-100"
            >
              Page View
            </Link>
            <Link
              href="/"
              className="rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-700 transition hover:bg-stone-100"
            >
              Utama
            </Link>
          </div>
        </div>

        <nav className="flex flex-wrap gap-2">
          {surahNumber > 1 ? (
            <Link
              href={`/read/surah/${surahNumber - 1}/themes`}
              className="rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-700 transition hover:bg-stone-100"
            >
              Prev Surah
            </Link>
          ) : (
            <span className="rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-400">
              Prev Surah
            </span>
          )}
          {surahNumber < 114 ? (
            <Link
              href={`/read/surah/${surahNumber + 1}/themes`}
              className="rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-700 transition hover:bg-stone-100"
            >
              Next Surah
            </Link>
          ) : (
            <span className="rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-400">
              Next Surah
            </span>
          )}
        </nav>
      </header>

      {loadError ? (
        <section className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {loadError}
        </section>
      ) : null}

      {!loadError && chunks.length > 0 ? (
        <section className="space-y-3 rounded-xl border border-stone-200 bg-white p-4">
          <h2 className="text-sm font-medium text-stone-900">
            Chunk Navigator ({selectedChunkIndex}/{chunks.length})
          </h2>
          <form method="get" className="flex flex-wrap items-end gap-2">
            <label className="text-xs text-stone-600">
              Pilih chunk
              <select
                name="chunk"
                defaultValue={String(selectedChunkIndex)}
                className="mt-1 block min-w-64 rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-sm text-stone-900"
              >
                {chunks.map((chunk) => (
                  <option key={chunk.chunk_index} value={chunk.chunk_index}>
                    {chunk.chunk_index}.{" "}
                    {rangeLabel(surahNumber, chunk.start_ayah, chunk.end_ayah)}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-700 transition hover:bg-stone-100"
            >
              Go
            </button>
          </form>
          <div className="flex flex-wrap gap-2">
            {selectedChunkIndex > 1 ? (
              <Link
                href={`/read/surah/${surahNumber}/themes?chunk=${selectedChunkIndex - 1}`}
                className="rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-700 transition hover:bg-stone-100"
              >
                Prev Chunk
              </Link>
            ) : (
              <span className="rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-400">
                Prev Chunk
              </span>
            )}
            {selectedChunkIndex < chunks.length ? (
              <Link
                href={`/read/surah/${surahNumber}/themes?chunk=${selectedChunkIndex + 1}`}
                className="rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-700 transition hover:bg-stone-100"
              >
                Next Chunk
              </Link>
            ) : (
              <span className="rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-400">
                Next Chunk
              </span>
            )}
          </div>
        </section>
      ) : null}

      {!loadError && chunks.length === 0 ? (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Tiada chunk tema untuk surah ini lagi.
        </section>
      ) : null}

      {!loadError ? (
        <section className="space-y-4">
          {selectedChunk ? (
            <article
              key={selectedChunk.chunk_index}
              id={`chunk-${selectedChunk.chunk_index}`}
              className="space-y-4 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm"
            >
              <header className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-stone-500">
                  Chunk {selectedChunk.chunk_index}
                </p>
                <h3 className="text-base font-medium text-stone-900">
                  {rangeLabel(
                    surahNumber,
                    selectedChunk.start_ayah,
                    selectedChunk.end_ayah,
                  )}{" "}
                  • {chunkTitleBm(selectedChunk)}
                </h3>
                <p className="text-sm text-stone-600">
                  {chunkTitleEn(selectedChunk)} • {selectedChunk.ayah_count} ayat
                </p>
                <p className="text-xs text-stone-500">
                  Mode: {selectedChunk.source === "manual" ? "Manual override" : "Auto"}
                </p>
              </header>

              <div className="space-y-3">
                {selectedChunk.ayat.map((ayah) => (
                  <article
                    key={ayah.id}
                    className="rounded-xl border border-stone-100 bg-stone-50 p-3"
                  >
                    <p className="text-right text-2xl leading-loose text-stone-900" dir="rtl">
                      {ayah.text_uthmani}
                    </p>
                    <p className="mt-2 text-sm leading-relaxed text-stone-700">
                      {ayah.display_bm ?? "Terjemahan BM belum tersedia."}
                    </p>
                    <p className="mt-2 text-xs text-stone-500">
                      {surahNumber}:{ayah.ayah_number} • Page {ayah.page_number}
                    </p>
                  </article>
                ))}
              </div>
            </article>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}
