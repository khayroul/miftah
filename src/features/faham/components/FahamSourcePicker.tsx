"use client";

import { useTranslations } from "next-intl";
import type { FahamMcqDirectionMode } from "../domain/mcq";
import {
  FAHAM_PRESET_CONFIGS,
  resolveFahamPresetDisplay,
  type FahamSourcePreset,
} from "../domain/presets";
import {
  CORRECT_ADVANCE_CONFIGS,
  FAHAM_MCQ_DIRECTION_MODES,
  resolveFahamCorrectAdvanceDisplay,
  resolveFahamDirectionDisplay,
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
  const t = useTranslations("faham.sources");
  const currentPreset = resolveFahamPresetDisplay(preset, t);
  const currentDirection = resolveFahamDirectionDisplay(directionMode, t);
  const currentCorrectAdvance = resolveFahamCorrectAdvanceDisplay(correctAdvanceMode, t);

  return (
    <section className="rounded-[2rem] border border-stone-200/85 bg-white/85 p-5 shadow-[0_30px_80px_-52px_rgba(41,37,36,0.4)] backdrop-blur-sm sm:p-7 dark:border-stone-600/70 dark:bg-stone-950/88">
      <aside className="animate-in fade-in slide-in-from-top-2 rounded-[1.75rem] border border-stone-200/80 bg-white/80 p-5 shadow-xl backdrop-blur-md duration-300 dark:border-white/10 dark:bg-stone-900/88">
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold uppercase tracking-[0.22em] text-stone-500 sm:text-base dark:text-stone-200">
              {t("deckTitle")}
            </p>
            <span className="rounded-full border border-stone-200 bg-white px-3 py-1 text-sm font-bold text-stone-600 sm:text-base dark:border-white/10 dark:bg-white/10 dark:text-stone-100">
              {currentPreset.shortLabel}
            </span>
          </div>

          <div className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="space-y-4">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.2em] text-stone-500 sm:text-base dark:text-stone-200">
                  {t("deckSourceTitle")}
                </p>
                <p className="mt-1 text-sm text-stone-600 sm:text-base dark:text-stone-100">
                  {t("deckSourceDescription")}
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
                        {resolveFahamPresetDisplay(key, t).label}
                      </button>
                    );
                  },
                )}
              </div>

              <div className="rounded-xl border border-stone-200/80 bg-white/60 p-3 text-sm leading-relaxed text-stone-600 sm:text-base dark:border-white/10 dark:bg-white/8 dark:text-stone-100">
                {currentPreset.helper}
              </div>
            </div>

            <div className="space-y-4 border-t border-stone-200/80 pt-5 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0 dark:border-white/10">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.2em] text-stone-500 sm:text-base dark:text-stone-200">
                  {t("directionTitle")}
                </p>
                <p className="mt-1 text-sm text-stone-600 sm:text-base dark:text-stone-100">
                  {currentDirection.helper}
                </p>
              </div>

              <div className="grid gap-2">
                {FAHAM_MCQ_DIRECTION_MODES.map(
                  (key) => {
                    const active = directionMode === key;
                    const display = resolveFahamDirectionDisplay(key, t);
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
                          {display.label}
                        </div>
                        <div className="mt-0.5 text-sm leading-tight text-stone-500 sm:text-base dark:text-stone-200">
                          {display.shortLabel}
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
                      {t("paceTitle")}
                    </p>
                    <p className="mt-1 text-sm text-stone-600 sm:text-base dark:text-stone-100">
                      {currentCorrectAdvance.helper}
                    </p>
                  </div>
                  <span className="rounded-full border border-stone-200 bg-white px-3 py-1 text-sm font-bold text-stone-600 sm:text-base dark:border-white/10 dark:bg-white/10 dark:text-stone-100">
                    {currentCorrectAdvance.shortLabel}
                  </span>
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-3">
                  {(
                    Object.keys(
                      CORRECT_ADVANCE_CONFIGS,
                    ) as FahamCorrectAdvanceMode[]
                  ).map((mode) => {
                    const active = correctAdvanceMode === mode;
                    const display = resolveFahamCorrectAdvanceDisplay(mode, t);
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
                          {display.label}
                        </div>
                        <div className="mt-0.5 text-sm leading-tight text-stone-500 sm:text-base dark:text-stone-200">
                          {display.shortLabel}
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
