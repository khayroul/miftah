export interface MushafWordHitbox {
  location: string;
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  surah?: number;
  ayah?: number;
  wordPosition?: number;
  wordId?: number;
}

export interface MushafPageManifest {
  page: number;
  schema_version: string;
  image_width: number;
  image_height: number;
  words: MushafWordHitbox[];
}

export interface MushafWordTranslation {
  location: string;
  bm?: string;
  en?: string;
}

export type MushafWordTranslationMap = Record<string, MushafWordTranslation>;
