/**
 * Compatibility facade for pre-Wave-7 imports.
 *
 * Database access now lives in the typed Read repository. Consumers may keep
 * this path while the Read shell moves independently, then migrate to the
 * repository/public feature boundary without a flag-day import rewrite.
 */
export {
  getAyah,
  getAyatByPage,
  getAyatBySurah,
  getAyatIdentityByPage,
  getAyatUpToPage,
  getSurah,
  getSurahs,
  getWordByWordForAyahIds,
} from "@/data/repositories/read/mushaf";

export type { AyahWordByWordEntry } from "@/data/repositories/read/mushaf";
