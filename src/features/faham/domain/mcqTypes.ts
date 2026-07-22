export type FahamMcqDirection = "arab_to_bm" | "bm_to_arab";
export type FahamMcqDirectionMode = FahamMcqDirection | "mixed";

// The language the MEANING side of an MCQ is rendered in. Follows the app
// locale (NEXT_LOCALE cookie). The Arabic side is unaffected; only which
// translation column ("ms" = translation_bm, "en" = translation_en) is used
// for prompts/options/glosses, and whether answer audio (Malay TTS only) is
// available. The direction values (arab_to_bm/bm_to_arab) are UNCHANGED for
// serialized-payload compatibility — "bm" now semantically means "the
// meaning-language side", whichever language that resolves to.
export type FahamMeaningLocale = "ms" | "en";

export interface FahamMcqPoolWord {
  audioKey: string | null;
  frequency: number;
  id: number;
  lemma: string | null;
  pos: string | null;
  root: string | null;
  textSimple: string;
  textUthmani: string;
  translationBm: string | null;
  translationEn: string | null;
  transliteration: string | null;
}

export interface FahamMcqOption {
  dir: "ltr" | "rtl";
  lang: "ar" | "ms" | "en";
  value: string;
}

export interface FahamBuiltMcq {
  answerAudioUrl: string | null;
  answerLabel: string;
  answerPrimary: string;
  answerSecondary: string | null;
  correctIndex: number;
  direction: FahamMcqDirection;
  options: FahamMcqOption[];
  promptAudioUrl: string | null;
  promptDir: "ltr" | "rtl";
  promptHint: string;
  promptLabel: string;
  promptLang: "ar" | "ms" | "en";
  promptPrimary: string;
  promptSecondary: string | null;
  whyThisSet: string[];
}
