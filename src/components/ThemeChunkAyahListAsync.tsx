import Image from "next/image";
import {
  getAyahImageClientSrc,
  loadAyahManifest,
} from "@/lib/mushafAssets";
import { getWordByWordForAyahIds } from "@/lib/queries";
import type {
  AyahWordByWordEntry,
  ThemeAppearanceAyah,
} from "@/lib/queries";
import { ThemeAyahMarker } from "./ThemeAyahMarker";

interface ThemeChunkAyahListAsyncProps {
  ayat: ThemeAppearanceAyah[];
}

interface HybridAyahState {
  ayahId: number;
  imageHeight: number | null;
  imageWidth: number | null;
}

function buildHybridAyahStates(
  ayat: ThemeAppearanceAyah[],
  imageDimensions: Array<{ imageHeight: number; imageWidth: number } | null>,
): HybridAyahState[] {
  return ayat.map((ayah, index) => ({
    ayahId: ayah.id,
    imageHeight: imageDimensions[index]?.imageHeight ?? null,
    imageWidth: imageDimensions[index]?.imageWidth ?? null,
  }));
}

function ThemeAyahImageCard({
  ayah,
  imageHeight,
  imageWidth,
}: {
  ayah: ThemeAppearanceAyah;
  imageHeight: number | null;
  imageWidth: number | null;
}) {
  if (!imageHeight || !imageWidth) {
    return (
      <div className="rounded-[1.6rem] border border-stone-200/80 bg-white/90 p-5 shadow-[0_20px_50px_-40px_rgba(28,25,23,0.3)] dark:border-stone-700/70 dark:bg-stone-900/70">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500 dark:text-stone-400">
              Ayat {ayah.surah_id}:{ayah.ayah_number}
            </p>
            <p
              className="mt-3 font-arabic text-right text-3xl leading-[2.1] text-stone-900 dark:text-stone-100"
              dir="rtl"
              lang="ar"
            >
              {ayah.text_uthmani}
            </p>
          </div>
          <ThemeAyahMarker ayahNumber={ayah.ayah_number} className="shrink-0" />
        </div>
        <p className="mt-3 text-sm text-stone-500 dark:text-stone-400">
          Imej ayat belum tersedia. Paparan teks digunakan sebagai fallback.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-[1.6rem] border border-stone-200/80 bg-white/90 p-4 shadow-[0_20px_50px_-40px_rgba(28,25,23,0.3)] dark:border-stone-700/70 dark:bg-stone-900/70">
      <div className="mb-3 flex items-center justify-between gap-4">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500 dark:text-stone-400">
          Ayat {ayah.surah_id}:{ayah.ayah_number}
        </p>
        <span className="text-xs text-stone-400 dark:text-stone-500">
          Mushaf view
        </span>
      </div>
      <Image
        src={getAyahImageClientSrc(ayah.surah_id, ayah.ayah_number)}
        alt={`Ayat ${ayah.surah_id}:${ayah.ayah_number}`}
        width={imageWidth}
        height={imageHeight}
        unoptimized
        loading="lazy"
        className="mx-auto h-auto w-full max-w-full object-contain dark:invert dark:[mix-blend-mode:lighten]"
      />
    </div>
  );
}

function ThemeWordByWordPanel({
  ayah,
  words,
}: {
  ayah: ThemeAppearanceAyah;
  words: AyahWordByWordEntry[];
}) {
  return (
    <details className="group/details rounded-[1.4rem] border border-stone-200/70 bg-stone-50/80 p-4 dark:border-stone-800/80 dark:bg-stone-900/30">
      <summary className="cursor-pointer list-none text-sm font-medium text-stone-700 marker:content-none dark:text-stone-200">
        <span className="flex items-center justify-between gap-4">
          <span>Kata demi kata</span>
          <span className="text-xs text-stone-500 transition-transform duration-200 group-open/details:rotate-180 dark:text-stone-400">
            v
          </span>
        </span>
      </summary>

      {words.length > 0 ? (
        <div className="mt-5 flex flex-wrap justify-start gap-x-1.5 gap-y-6" dir="rtl">
          {words.map((word) => (
            <div
              key={`${ayah.id}-${word.position}`}
              className="group/word flex min-w-fit max-w-max flex-1 cursor-pointer flex-col items-center justify-start rounded-lg p-2 transition-colors hover:bg-white/80 dark:hover:bg-stone-800/50"
            >
              <span
                className="font-arabic mb-2 block text-center text-4xl leading-[1.6] text-stone-900 dark:text-stone-100 sm:text-5xl"
                lang="ar"
              >
                {word.text_uthmani}
              </span>
              <span
                dir="ltr"
                className="block text-center text-xs leading-snug text-stone-500 transition-colors line-clamp-2 group-hover/word:text-stone-800 dark:text-stone-400 dark:group-hover/word:text-stone-200 sm:text-sm"
              >
                {word.translation_bm ?? word.translation_en ?? "—"}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-4 flex items-center justify-start gap-2" dir="rtl">
          <ThemeAyahMarker ayahNumber={ayah.ayah_number} className="shrink-0" />
          <p className="text-right text-sm text-stone-400">
            Data kata demi kata belum tersedia.
          </p>
        </div>
      )}
    </details>
  );
}

export async function ThemeChunkAyahListAsync({
  ayat,
}: ThemeChunkAyahListAsyncProps) {
  let wbwByAyahId: Record<number, AyahWordByWordEntry[]> = {};

  try {
    wbwByAyahId = await getWordByWordForAyahIds(ayat.map((ayah) => ayah.id));
  } catch {
    wbwByAyahId = {};
  }

  const imageDimensions = await Promise.all(
    ayat.map(async (ayah) => {
      const manifest = await loadAyahManifest(ayah.surah_id, ayah.ayah_number);
      if (!manifest) {
        return null;
      }

      return {
        imageHeight: manifest.image_height,
        imageWidth: manifest.image_width,
      };
    }),
  );
  const hybridAyahStates = buildHybridAyahStates(ayat, imageDimensions);
  const hybridAyahStateById = new Map(
    hybridAyahStates.map((state) => [state.ayahId, state]),
  );
  const hasAnyAyahImage = hybridAyahStates.some(
    (state) => state.imageHeight && state.imageWidth,
  );

  return (
    <div className="space-y-16 pb-8">
      <section className="rounded-[1.7rem] border border-stone-200/80 bg-stone-50/80 p-5 text-sm text-stone-600 dark:border-stone-800/70 dark:bg-stone-900/35 dark:text-stone-300">
        <p>
          Paparan ini guna mod hybrid: imej ayat mushaf dipaparkan dahulu, dan
          panel kata demi kata kekal tersedia untuk rujukan.
        </p>
        {!hasAnyAyahImage ? (
          <p className="mt-2 text-stone-500 dark:text-stone-400">
            Asset imej ayat belum tersedia untuk surah ini, jadi paparan fallback
            teks digunakan.
          </p>
        ) : null}
      </section>

      {ayat.map((ayah) => {
        const words = wbwByAyahId[ayah.id] ?? [];
        const ayahState = hybridAyahStateById.get(ayah.id) ?? null;

        return (
          <div key={ayah.id} className="group/ayah flex flex-col gap-6">
            <ThemeAyahImageCard
              ayah={ayah}
              imageHeight={ayahState?.imageHeight ?? null}
              imageWidth={ayahState?.imageWidth ?? null}
            />
            <ThemeWordByWordPanel ayah={ayah} words={words} />

            <div>
              <div className="rounded-xl border border-stone-100 bg-stone-50/50 p-4 dark:border-stone-800/80 dark:bg-stone-800/20 sm:p-5">
                <p className="text-[15px] leading-relaxed text-stone-700 dark:text-stone-300">
                  {ayah.display_bm ?? "Terjemahan BM belum tersedia."}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
