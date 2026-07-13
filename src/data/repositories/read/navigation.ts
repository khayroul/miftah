import { supabaseBrowser } from "@/data/supabase/browser";

export interface AyahNavigationRow {
  surah_id: number | null;
  juz_number: number | null;
  page_number: number | null;
}

export interface SurahNavigationName {
  id: number;
  name_transliteration: string | null;
}

export interface ReadNavigationDataset {
  ayat: AyahNavigationRow[];
  surahs: SurahNavigationName[];
}

async function fetchAllAyahNavigationRows(): Promise<AyahNavigationRow[]> {
  const pageSize = 1000;
  let from = 0;
  const rows: AyahNavigationRow[] = [];

  while (true) {
    const { data, error } = await supabaseBrowser
      .from("ayat")
      .select("surah_id,juz_number,page_number")
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) {
      throw error;
    }

    if (!data || data.length === 0) {
      break;
    }

    rows.push(...data);

    if (data.length < pageSize) {
      break;
    }

    from += pageSize;
  }

  return rows;
}

/**
 * Loads the database fallback for jump targets. The normal path uses local
 * seed JSON, so this query is deliberately explicit and hourly cached by the
 * domain caller rather than repeated per request.
 */
export async function fetchReadNavigationDataset(): Promise<ReadNavigationDataset> {
  const [ayat, surahResponse] = await Promise.all([
    fetchAllAyahNavigationRows(),
    supabaseBrowser
      .from("surahs")
      .select("id,name_transliteration")
      .order("id", { ascending: true }),
  ]);

  return {
    ayat: ayat.map((row) => ({
      surah_id: row.surah_id,
      juz_number: row.juz_number,
      page_number: row.page_number,
    })),
    surahs: surahResponse.error
      ? []
      : (surahResponse.data ?? []).map((row) => ({
          id: row.id,
          name_transliteration: row.name_transliteration,
        })),
  };
}
