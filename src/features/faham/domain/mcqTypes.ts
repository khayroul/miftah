export type FahamMcqDirection = "arab_to_bm" | "bm_to_arab";
export type FahamMcqDirectionMode = FahamMcqDirection | "mixed";

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
  transliteration: string | null;
}

export interface FahamMcqOption {
  dir: "ltr" | "rtl";
  lang: "ar" | "ms";
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
  promptLang: "ar" | "ms";
  promptPrimary: string;
  promptSecondary: string | null;
  whyThisSet: string[];
}
