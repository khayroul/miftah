import { createClient } from "@supabase/supabase-js";
import { mapAyatToPageAudioTracks, type ReadAudioTrack } from "./pageAudioTracks";
import type { Ayah } from "@/types/database";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://placeholder.invalid";
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "placeholder-key";

let browserClient: ReturnType<typeof createClient> | null = null;

function getClient() {
  if (!browserClient) {
    browserClient = createClient(supabaseUrl, supabaseAnonKey);
  }
  return browserClient;
}

export async function fetchSurahAudioTracks(
  surahId: number,
): Promise<ReadAudioTrack[]> {
  const client = getClient();
  const { data, error } = await client
    .from("ayat")
    .select("*")
    .eq("surah_id", surahId)
    .order("ayah_number");
  if (error) {
    console.error("Failed to fetch surah ayat for audio:", error);
    return [];
  }
  return mapAyatToPageAudioTracks(data as Ayah[]);
}

export async function fetchJuzAudioTracks(
  juzNumber: number,
): Promise<ReadAudioTrack[]> {
  const client = getClient();
  const { data, error } = await client
    .from("ayat")
    .select("*")
    .eq("juz_number", juzNumber)
    .order("surah_id")
    .order("ayah_number");
  if (error) {
    console.error("Failed to fetch juz ayat for audio:", error);
    return [];
  }
  return mapAyatToPageAudioTracks(data as Ayah[]);
}
