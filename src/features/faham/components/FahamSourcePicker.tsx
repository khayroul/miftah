import type { FahamMcqDirectionMode } from "../domain/mcq";
import {
  FAHAM_PRESET_CONFIGS,
  type FahamSourcePreset,
} from "../domain/presets";
import {
  CORRECT_ADVANCE_CONFIGS,
  DIRECTION_CONFIGS,
  type FahamCorrectAdvanceMode,
} from "./fahamWorkspaceConfig";

export type { FahamCorrectAdvanceMode } from "./fahamWorkspaceConfig";

export function FahamSourcePicker({
  correctAdvanceMode,
  directionMode,
  isPending,
  onCorrectAdvanceModeChange,
  onReloadQueue,
  preset,
}: {
  correctAdvanceMode: FahamCorrectAdvanceMode;
  directionMode: FahamMcqDirectionMode;
  isPending: boolean;
  onCorrectAdvanceModeChange: (mode: FahamCorrectAdvanceMode) => void;
  onReloadQueue: (
    preset: FahamSourcePreset,
    directionMode: FahamMcqDirectionMode,
  ) => void;
  preset: FahamSourcePreset;
}) {
  return (
    <section className="rounded-[2rem] border border-stone-200/85 bg-white/85 p-5 shadow-[0_30px_80px_-52px_rgba(41,37,36,0.4)] backdrop-blur-sm sm:p-7 dark:border-stone-600/70 dark:bg-stone-950/88">
      <aside className="animate-in fade-in slide-in-from-top-2 rounded-[1.75rem] border border-stone-200/80 bg-white/80 p-5 shadow-xl backdrop-blur-md duration-300 dark:border-white/10 dark:bg-stone-900/88">
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold uppercase tracking-[0.22em] text-stone-500 sm:text-base dark:text-stone-200">
              Susun deck sesi ini
            </p>
            <span className="rounded-full border border-stone-200 bg-white px-3 py-1 text-sm font-bold text-stone-600 sm:text-base dark:border-white/10 dark:bg-white/10 dark:text-stone-100">
              {FAHAM_PRESET_CONFIGS[preset].shortLabel}
            </span>
          </div>

          <div className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="space-y-4">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.2em] text-stone-500 sm:text-base dark:text-stone-200">
                  Sumber deck
                </p>
                <p className="mt-1 text-sm text-stone-600 sm:text-base dark:text-stone-100">
                  Pilih sumber pendedahan yang paling dekat dengan fokus bacaan
                  anda sekarang.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(FAHAM_PRESET_CONFIGS) as FahamSourcePreset[]).map(
                  (key) => {
                    const active = preset === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => onReloadQueue(key, directionMode)}
                        disabled={isPending}
                        className={`rounded-xl border px-3 py-2.5 text-left text-sm font-semibold transition sm:text-base ${
                          active
                            ? "border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-500/50 dark:bg-amber-900/30 dark:text-amber-100"
                            : "border-stone-200 bg-white text-stone-700 hover:bg-stone-100 dark:border-white/10 dark:bg-white/8 dark:text-stone-100 dark:hover:bg-white/14"
                        }`}
                      >
                        {FAHAM_PRESET_CONFIGS[key].label}
                      </button>
                    );
                  },
                )}
              </div>

              <div className="rounded-xl border border-stone-200/80 bg-white/60 p-3 text-sm leading-relaxed text-stone-600 sm:text-base dark:border-white/10 dark:bg-white/8 dark:text-stone-100">
                {FAHAM_PRESET_CONFIGS[preset].helper}
              </div>
            </div>

            <div className="space-y-4 border-t border-stone-200/80 pt-5 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0 dark:border-white/10">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.2em] text-stone-500 sm:text-base dark:text-stone-200">
                  Arah soalan
                </p>
                <p className="mt-1 text-sm text-stone-600 sm:text-base dark:text-stone-100">
                  {DIRECTION_CONFIGS[directionMode].helper}
                </p>
              </div>

              <div className="grid gap-2">
                {(Object.keys(DIRECTION_CONFIGS) as FahamMcqDirectionMode[]).map(
                  (key) => {
                    const active = directionMode === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => onReloadQueue(preset, key)}
                        disabled={isPending}
                        className={`rounded-xl border px-4 py-2.5 text-left transition ${
                          active
                            ? "border-teal-300 bg-teal-50 text-teal-900 dark:border-teal-500/50 dark:bg-teal-950/30 dark:text-teal-100"
                            : "border-stone-200 bg-white text-stone-700 hover:bg-stone-100 dark:border-white/10 dark:bg-white/8 dark:text-stone-100 dark:hover:bg-white/14"
                        }`}
                      >
                        <div className="text-sm font-bold sm:text-base">
                          {DIRECTION_CONFIGS[key].label}
                        </div>
                        <div className="mt-0.5 text-sm leading-tight text-stone-500 sm:text-base dark:text-stone-200">
                          {DIRECTION_CONFIGS[key].shortLabel}
                        </div>
                      </button>
                    );
                  },
                )}
              </div>

              <div className="rounded-[1.35rem] border border-stone-200/80 bg-stone-50/80 p-4 dark:border-white/10 dark:bg-white/8">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold uppercase tracking-[0.22em] text-stone-500 sm:text-base dark:text-stone-200">
                      Rentak selepas betul
                    </p>
                    <p className="mt-1 text-sm text-stone-600 sm:text-base dark:text-stone-100">
                      {CORRECT_ADVANCE_CONFIGS[correctAdvanceMode].helper}
                    </p>
                  </div>
                  <span className="rounded-full border border-stone-200 bg-white px-3 py-1 text-sm font-bold text-stone-600 sm:text-base dark:border-white/10 dark:bg-white/10 dark:text-stone-100">
                    {CORRECT_ADVANCE_CONFIGS[correctAdvanceMode].shortLabel}
                  </span>
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-3">
                  {(
                    Object.keys(
                      CORRECT_ADVANCE_CONFIGS,
                    ) as FahamCorrectAdvanceMode[]
                  ).map((mode) => {
                    const active = correctAdvanceMode === mode;
                    return (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => onCorrectAdvanceModeChange(mode)}
                        className={`rounded-xl border px-4 py-2.5 text-left transition ${
                          active
                            ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-500/50 dark:bg-emerald-950/30 dark:text-emerald-100"
                            : "border-stone-200 bg-white text-stone-700 hover:bg-stone-100 dark:border-white/10 dark:bg-white/8 dark:text-stone-100 dark:hover:bg-white/14"
                        }`}
                      >
                        <div className="text-sm font-bold sm:text-base">
                          {CORRECT_ADVANCE_CONFIGS[mode].label}
                        </div>
                        <div className="mt-0.5 text-sm leading-tight text-stone-500 sm:text-base dark:text-stone-200">
                          {CORRECT_ADVANCE_CONFIGS[mode].shortLabel}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </section>
  );
}
