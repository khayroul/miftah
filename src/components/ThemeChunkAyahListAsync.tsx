import Image from "next/image";
import {
  getWordImageClientSrc,
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

interface AyahMarkerAsset {
  ayahId: number;
  height: number;
  width: number;
  wordId: number;
}

function resolveAyahMarkerAsset(
  ayahId: number,
  manifestWordsCount: number,
  wbwWordsCount: number,
  lastWord: {
    height?: number;
    width?: number;
    wordId?: number;
  } | null,
): AyahMarkerAsset | null {
  if (!lastWord?.wordId || !lastWord.width || !lastWord.height) {
    return null;
  }

  // Official ayah manifests include the end-of-ayah sign as one extra crop
  // beyond the WBW word sequence. Use that final crop as the authentic marker.
  if (manifestWordsCount !== wbwWordsCount + 1) {
    return null;
  }

  return {
    ayahId,
    height: lastWord.height,
    width: lastWord.width,
    wordId: lastWord.wordId,
  };
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

  const markerAssets = await Promise.all(
    ayat.map(async (ayah) => {
      const manifest = await loadAyahManifest(ayah.surah_id, ayah.ayah_number);
      if (!manifest) {
        return null;
      }

      const wbwWords = wbwByAyahId[ayah.id] ?? [];
      const lastWord = manifest.words[manifest.words.length - 1] ?? null;

      return resolveAyahMarkerAsset(
        ayah.id,
        manifest.words.length,
        wbwWords.length,
        lastWord
          ? {
              height: lastWord.height,
              width: lastWord.width,
              wordId: lastWord.wordId,
            }
          : null,
      );
    }),
  );
  const markerAssetByAyahId = new Map(
    markerAssets
      .filter((asset): asset is AyahMarkerAsset => asset !== null)
      .map((asset) => [asset.ayahId, asset]),
  );

  return (
    <div className="space-y-14 pb-8">
      {ayat.map((ayah) => {
        const markerAsset = markerAssetByAyahId.get(ayah.id) ?? null;

        return (
          <article
            key={ayah.id}
            className="group/ayah relative overflow-hidden rounded-[1.9rem] border border-stone-200/80 bg-white/80 p-5 shadow-[0_28px_80px_-52px_rgba(28,25,23,0.22)] backdrop-blur-sm dark:border-stone-700/80 dark:bg-stone-900/55"
          >
            <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-emerald-100/70 via-transparent to-transparent dark:from-emerald-500/10" />
            <div className="relative flex flex-col gap-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-stone-500 dark:text-stone-400">
                    Ayat {ayah.surah_id}:{ayah.ayah_number}
                  </p>
                </div>
              </div>

              {wbwByAyahId[ayah.id] && wbwByAyahId[ayah.id].length > 0 ? (
                <div className="rounded-[1.5rem] border border-stone-200/70 bg-gradient-to-br from-stone-50 via-white to-emerald-50/50 p-3.5 dark:border-stone-700/70 dark:from-stone-900/90 dark:via-stone-900/70 dark:to-emerald-950/20">
                  <div
                    className="flex flex-wrap justify-start gap-2.5 gap-y-3"
                    dir="rtl"
                  >
                    {wbwByAyahId[ayah.id].map((word) => (
                      <div
                        key={`${ayah.id}-${word.position}`}
                        className="group/word flex min-w-[5.6rem] max-w-[8.5rem] flex-none flex-col items-center justify-start rounded-[1.25rem] border border-stone-200/80 bg-white/92 px-3 py-3 text-center shadow-[0_14px_30px_-24px_rgba(28,25,23,0.35)] transition duration-200 hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-[0_18px_34px_-24px_rgba(5,150,105,0.28)] dark:border-stone-700/70 dark:bg-stone-900/80 dark:hover:border-emerald-700/50 dark:hover:bg-stone-900"
                      >
                        <span
                          className="font-arabic mb-2 block text-center text-[2.25rem] leading-[1.55] text-stone-900 dark:text-stone-100 sm:text-[2.8rem]"
                          lang="ar"
                        >
                          {word.text_uthmani}
                        </span>
                        <span
                          dir="ltr"
                          className="block text-center text-[11px] leading-snug text-stone-600 transition-colors line-clamp-2 group-hover/word:text-stone-800 dark:text-stone-400 dark:group-hover/word:text-stone-200 sm:text-xs"
                        >
                          {word.translation_bm ?? word.translation_en ?? "—"}
                        </span>
                      </div>
                    ))}
                    {markerAsset ? (
                      <Image
                        src={getWordImageClientSrc(markerAsset.wordId)}
                        alt={`Tanda akhir ayat ${ayah.surah_id}:${ayah.ayah_number}`}
                        width={markerAsset.width}
                        height={markerAsset.height}
                        unoptimized
                        className="mr-1 h-14 w-auto self-center object-contain sm:h-16"
                      />
                    ) : (
                      <ThemeAyahMarker
                        ayahNumber={ayah.ayah_number}
                        className="mr-1 self-center"
                      />
                    )}
                  </div>
                </div>
              ) : (
                <div className="rounded-[1.5rem] border border-dashed border-stone-200/80 bg-stone-50/80 p-4 dark:border-stone-700/70 dark:bg-stone-900/35">
                  <div className="flex items-center justify-start gap-3" dir="rtl">
                    <ThemeAyahMarker
                      ayahNumber={ayah.ayah_number}
                      className="shrink-0"
                    />
                    <p className="text-right text-sm text-stone-500 dark:text-stone-400">
                      Data kata demi kata belum tersedia untuk ayat ini.
                    </p>
                  </div>
                </div>
              )}

              <div>
                <div className="rounded-[1.4rem] border border-stone-100/90 bg-stone-50/75 p-4 dark:border-stone-800/80 dark:bg-stone-800/20 sm:p-5">
                  <p className="text-[0.72rem] font-semibold uppercase tracking-[0.2em] text-stone-500 dark:text-stone-400">
                    Terjemahan BM
                  </p>
                  <p className="mt-3 text-[15px] leading-relaxed text-stone-700 dark:text-stone-300">
                    {ayah.display_bm ?? "Terjemahan BM belum tersedia."}
                  </p>
                </div>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
