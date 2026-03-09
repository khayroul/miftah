import Link from "next/link";
import { notFound } from "next/navigation";
import { MushafPageView } from "@/components/MushafPageView";
import { loadPageManifest, pageImageExists } from "@/lib/mushafAssets";
import { getWordTranslationsByLocation } from "@/lib/wbwTranslations";

interface ReadPageProps {
  params: Promise<{ page: string }>;
}

function parsePageNumber(value: string): number | null {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 604) {
    return null;
  }
  return parsed;
}

function parseSurahFromLocation(location: string | undefined): number | null {
  if (!location) {
    return null;
  }
  const [surah] = location.split(":");
  const surahNumber = Number.parseInt(surah, 10);
  if (!Number.isInteger(surahNumber) || surahNumber < 1 || surahNumber > 114) {
    return null;
  }
  return surahNumber;
}

export default async function ReadPage({ params }: ReadPageProps) {
  const { page } = await params;
  const pageNumber = parsePageNumber(page);

  if (!pageNumber) {
    notFound();
  }

  const [manifest, imageAvailable] = await Promise.all([
    loadPageManifest(pageNumber),
    pageImageExists(pageNumber),
  ]);
  const wordTranslations = manifest
    ? await getWordTranslationsByLocation(manifest.words.map((word) => word.location))
    : {};
  const firstWordLocation = manifest?.words[0]?.location;
  const surahForThemeView = parseSurahFromLocation(firstWordLocation) ?? 1;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
      <header className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-medium text-stone-900">
              Mushaf View
            </h1>
            <p className="text-sm text-stone-600">Halaman {pageNumber} / 604</p>
          </div>
          <Link
            href="/"
            className="rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-700 transition hover:bg-stone-100"
          >
            Utama
          </Link>
        </div>
        <nav className="flex flex-wrap gap-2">
          <Link
            href={`/read/surah/${surahForThemeView}/themes`}
            className="rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-700 transition hover:bg-stone-100"
          >
            Theme Chunks
          </Link>
          {pageNumber > 1 ? (
            <Link
              href={`/read/${pageNumber - 1}`}
              className="rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-700 transition hover:bg-stone-100"
            >
              Prev
            </Link>
          ) : (
            <span className="rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-400">
              Prev
            </span>
          )}
          {pageNumber < 604 ? (
            <Link
              href={`/read/${pageNumber + 1}`}
              className="rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-700 transition hover:bg-stone-100"
            >
              Next
            </Link>
          ) : (
            <span className="rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-400">
              Next
            </span>
          )}
        </nav>
      </header>

      <MushafPageView
        key={pageNumber}
        pageNumber={pageNumber}
        imageAvailable={imageAvailable}
        manifest={manifest}
        wordTranslations={wordTranslations}
      />
    </main>
  );
}
