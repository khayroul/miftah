import type { FahamMcqDirectionMode } from "../domain/mcq";

export const DIRECTION_CONFIGS: Record<
  FahamMcqDirectionMode,
  { helper: string; label: string; shortLabel: string }
> = {
  arab_to_bm: {
    helper: "Paparkan perkataan Arab, kemudian cari maksud Melayu yang tepat.",
    label: "Arab -> Melayu",
    shortLabel: "A->M",
  },
  bm_to_arab: {
    helper: "Paparkan makna Melayu, kemudian pilih perkataan Arab yang tepat.",
    label: "Melayu -> Arab",
    shortLabel: "M->A",
  },
  mixed: {
    helper:
      "Selang-selikan kedua-dua arah supaya recall tidak terlalu bergantung pada satu bentuk soalan.",
    label: "Campur dua arah",
    shortLabel: "Campur",
  },
};

export type FahamCorrectAdvanceMode = "fast" | "normal" | "pause";

export const CORRECT_ADVANCE_CONFIGS: Record<
  FahamCorrectAdvanceMode,
  {
    delayMs: number | null;
    helper: string;
    label: string;
    shortLabel: string;
  }
> = {
  fast: {
    delayMs: 1000,
    helper:
      "Kad seterusnya muncul selepas 1 saat. Sesuai jika anda mahu rentak lebih laju.",
    label: "Cepat",
    shortLabel: "1s",
  },
  normal: {
    delayMs: 3000,
    helper:
      "Kad seterusnya muncul selepas 3 saat. Ini kadar biasa untuk dengar jawapan seketika.",
    label: "Normal",
    shortLabel: "3s",
  },
  pause: {
    delayMs: null,
    helper:
      "Sesi berhenti selepas jawapan betul sehingga anda tekan kad seterusnya sendiri.",
    label: "Jeda",
    shortLabel: "Jeda",
  },
};
