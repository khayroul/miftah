/** Compatibility facade; query and typed mapping now live in the Read repository. */
export {
  fetchJuzAudioTracks,
  fetchSurahAudioTracks,
  mapExpandedAudioAyatToTracks,
} from "@/data/repositories/read/audio";
