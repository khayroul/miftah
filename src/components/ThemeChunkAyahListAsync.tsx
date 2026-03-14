import { getWordByWordForAyahIds } from "@/lib/queries";
import type {
  AyahWordByWordEntry,
  ThemeAppearanceAyah,
} from "@/lib/queries";
import { ThemeAyahMarker } from "./ThemeAyahMarker";

interface ThemeChunkAyahListAsyncProps {
  ayat: ThemeAppearanceAyah[];
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

  return (
    <div className="space-y-16 pb-8">
      {ayat.map((ayah) => (
        <div key={ayah.id} className="group/ayah flex flex-col gap-6">
          {wbwByAyahId[ayah.id] && wbwByAyahId[ayah.id].length > 0 ? (
            <div
              className="flex flex-wrap justify-start gap-x-1.5 gap-y-6"
              dir="rtl"
            >
              {wbwByAyahId[ayah.id].map((word) => (
                <div
                  key={`${ayah.id}-${word.position}`}
                  className="group/word flex min-w-fit max-w-max flex-1 cursor-pointer flex-col items-center justify-start rounded-lg p-2 transition-colors hover:bg-stone-50 dark:hover:bg-stone-800/50"
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
              <ThemeAyahMarker
                ayahNumber={ayah.ayah_number}
                className="mb-2 self-center"
              />
            </div>
          ) : (
            <div className="flex items-center justify-start gap-2" dir="rtl">
              <ThemeAyahMarker ayahNumber={ayah.ayah_number} className="shrink-0" />
              <p className="text-right text-sm text-stone-400">
                [Data kata demi kata belum tersedia]
              </p>
            </div>
          )}

          <div className="mt-2">
            <div className="rounded-xl border border-stone-100 bg-stone-50/50 p-4 dark:border-stone-800/80 dark:bg-stone-800/20 sm:p-5">
              <p className="text-[15px] leading-relaxed text-stone-700 dark:text-stone-300">
                {ayah.display_bm ?? "Terjemahan BM belum tersedia."}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
