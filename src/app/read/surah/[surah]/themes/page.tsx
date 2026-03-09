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
}: SurahThemeAppearancePageProps) {
  const { surah } = await params;
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
          <h2 className="text-sm font-medium text-stone-900">Chunk Navigator</h2>
          <div className="flex flex-wrap gap-2">
            {chunks.map((chunk) => (
              <a
                key={chunk.chunk_index}
                href={`#chunk-${chunk.chunk_index}`}
                className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs text-stone-700 transition hover:bg-stone-100"
              >
                {rangeLabel(surahNumber, chunk.start_ayah, chunk.end_ayah)}
              </a>
            ))}
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
          {chunks.map((chunk) => (
            <article
              key={chunk.chunk_index}
              id={`chunk-${chunk.chunk_index}`}
              className="space-y-4 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm"
            >
              <header className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-stone-500">
                  Chunk {chunk.chunk_index}
                </p>
                <h3 className="text-base font-medium text-stone-900">
                  {rangeLabel(surahNumber, chunk.start_ayah, chunk.end_ayah)} •{" "}
                  {chunkTitleBm(chunk)}
                </h3>
                <p className="text-sm text-stone-600">
                  {chunkTitleEn(chunk)} • {chunk.ayah_count} ayat
                </p>
                <p className="text-xs text-stone-500">
                  Mode: {chunk.source === "manual" ? "Manual override" : "Auto"}
                </p>
              </header>

              <div className="space-y-3">
                {chunk.ayat.map((ayah) => (
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
          ))}
        </section>
      ) : null}
    </main>
  );
}
