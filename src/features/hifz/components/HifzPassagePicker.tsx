"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import type {
  JuzJumpTarget,
  SurahJumpTarget,
} from "@/lib/readNavigation";
import type { HifzPracticeViewMode } from "./HifzPracticeView";

type PassageMethod = "surah" | "juz" | "page";
type PassagePickerStep = "passage" | "view";

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "select:not([disabled])",
  "input:not([disabled])",
  "a[href]",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => !element.hasAttribute("hidden") && element.getAttribute("aria-hidden") !== "true",
  );
}

export interface HifzPassageSelection {
  endAyah?: number;
  endPage?: number;
  label: string;
  pageNumber: number;
  startAyah?: number;
  startPage?: number;
  surah?: number;
  view: HifzPracticeViewMode;
}

interface PassageLocationResponse {
  endPage?: number;
  startPage?: number;
}

interface HifzPassagePickerProps {
  isPending: boolean;
  juzTargets: JuzJumpTarget[];
  onSelect: (selection: HifzPassageSelection) => void;
  surahTargets: SurahJumpTarget[];
}

function BookOpenIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4.5 5.5A3.5 3.5 0 0 1 8 2h4v17H8a3.5 3.5 0 0 0-3.5 3V5.5Z" />
      <path d="M19.5 5.5A3.5 3.5 0 0 0 16 2h-4v17h4a3.5 3.5 0 0 1 3.5 3V5.5Z" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m9 18 6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function HifzPassagePicker({
  isPending,
  juzTargets,
  onSelect,
  surahTargets,
}: HifzPassagePickerProps) {
  const t = useTranslations("hifz.passagePicker");
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<PassagePickerStep>("passage");
  const [method, setMethod] = useState<PassageMethod>("surah");
  const [surahNumber, setSurahNumber] = useState(1);
  const [startAyahInput, setStartAyahInput] = useState("1");
  const [endAyahInput, setEndAyahInput] = useState("3");
  const [juzNumber, setJuzNumber] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [view, setView] = useState<HifzPracticeViewMode>("ayah");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isResolving, setIsResolving] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);

  const selectedSurah = useMemo(
    () => surahTargets.find((target) => target.surah === surahNumber) ?? surahTargets[0],
    [surahNumber, surahTargets],
  );
  const selectedJuz = useMemo(
    () => juzTargets.find((target) => target.juz === juzNumber) ?? juzTargets[0],
    [juzNumber, juzTargets],
  );
  const startAyah = Number.parseInt(startAyahInput, 10);
  const endAyah = Number.parseInt(endAyahInput, 10);
  const maxAyah = selectedSurah?.ayahCount ?? 1;

  const closeDialog = useCallback(() => {
    setIsOpen(false);
  }, []);

  const openDialog = useCallback(() => {
    setStep("passage");
    setErrorMessage(null);
    setIsOpen(true);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const dialog = dialogRef.current;
    const overlay = overlayRef.current;
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : triggerRef.current;
    const previousOverflow = document.body.style.overflow;
    const siblingStates = overlay
      ? Array.from(document.body.children)
          .filter((element) => element !== overlay)
          .map((element) => ({
            ariaHidden: element.getAttribute("aria-hidden"),
            element,
            wasInert: element.hasAttribute("inert"),
          }))
      : [];

    document.body.style.overflow = "hidden";
    siblingStates.forEach(({ element }) => {
      element.setAttribute("inert", "");
      element.setAttribute("aria-hidden", "true");
    });

    const focusFrame = window.requestAnimationFrame(() => {
      stepHeadingRef.current?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDialog();
        return;
      }

      if (event.key !== "Tab" || !dialog) return;
      const focusable = getFocusableElements(dialog);
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      siblingStates.forEach(({ ariaHidden, element, wasInert }) => {
        if (!wasInert) element.removeAttribute("inert");
        if (ariaHidden === null) {
          element.removeAttribute("aria-hidden");
        } else {
          element.setAttribute("aria-hidden", ariaHidden);
        }
      });
      previouslyFocused?.focus();
    };
  }, [closeDialog, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const focusFrame = window.requestAnimationFrame(() => {
      stepHeadingRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(focusFrame);
  }, [isOpen, step]);

  function updateSurah(nextSurah: number) {
    const target = surahTargets.find((option) => option.surah === nextSurah);
    const nextMaxAyah = target?.ayahCount ?? 1;
    setSurahNumber(nextSurah);
    setStartAyahInput("1");
    setEndAyahInput(String(Math.min(3, nextMaxAyah)));
    setErrorMessage(null);
  }

  function setAyahSpan(count: number | "rest") {
    const safeStart = Number.isInteger(startAyah)
      ? Math.max(1, Math.min(startAyah, maxAyah))
      : 1;
    const nextEnd = count === "rest"
      ? maxAyah
      : Math.min(safeStart + count - 1, maxAyah);
    setStartAyahInput(String(safeStart));
    setEndAyahInput(String(nextEnd));
    setErrorMessage(null);
  }

  function buildPreview(): string {
    if (method === "page") {
      return t("pagePreview", { page: pageInput || "—" });
    }
    if (method === "juz") {
      return t("juzPreview", {
        juz: selectedJuz?.juz ?? juzNumber,
        page: selectedJuz?.page ?? "—",
      });
    }
    return t("surahPreview", {
      surah: selectedSurah?.name ?? t("surahFallback", { surah: surahNumber }),
      start: startAyahInput || "—",
      end: endAyahInput || "—",
    });
  }

  function validatePassage(): boolean {
    if (method === "page") {
      const pageNumber = Number.parseInt(pageInput, 10);
      if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > 604) {
        setErrorMessage(t("pageError"));
        return false;
      }
      return true;
    }

    if (method === "juz") {
      if (!selectedJuz) {
        setErrorMessage(t("juzError"));
        return false;
      }
      return true;
    }

    if (
      !selectedSurah ||
      !Number.isInteger(startAyah) ||
      !Number.isInteger(endAyah) ||
      startAyah < 1 ||
      endAyah < startAyah ||
      endAyah > maxAyah
    ) {
      setErrorMessage(t("ayahError", { max: maxAyah }));
      return false;
    }
    return true;
  }

  function continueToView() {
    setErrorMessage(null);
    if (validatePassage()) setStep("view");
  }

  function handleMethodKeyDown(
    event: ReactKeyboardEvent<HTMLButtonElement>,
    index: number,
  ) {
    const lastIndex = methods.length - 1;
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = index === lastIndex ? 0 : index + 1;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = index === 0 ? lastIndex : index - 1;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = lastIndex;
    }

    if (nextIndex === null) return;
    event.preventDefault();
    const nextMethod = methods[nextIndex].value;
    setMethod(nextMethod);
    setErrorMessage(null);
    window.requestAnimationFrame(() => {
      document.getElementById(`passage-method-${nextMethod}`)?.focus();
    });
  }

  async function submitSelection() {
    setErrorMessage(null);

    if (method === "page") {
      const pageNumber = Number.parseInt(pageInput, 10);
      if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > 604) {
        setErrorMessage(t("pageError"));
        return;
      }
      onSelect({
        label: t("pagePreview", { page: pageNumber }),
        pageNumber,
        view,
      });
      closeDialog();
      return;
    }

    if (method === "juz") {
      if (!selectedJuz) {
        setErrorMessage(t("juzError"));
        return;
      }
      onSelect({
        label: t("juzPreview", { juz: selectedJuz.juz, page: selectedJuz.page }),
        pageNumber: selectedJuz.page,
        view,
      });
      closeDialog();
      return;
    }

    if (
      !selectedSurah ||
      !Number.isInteger(startAyah) ||
      !Number.isInteger(endAyah) ||
      startAyah < 1 ||
      endAyah < startAyah ||
      endAyah > maxAyah
    ) {
      setErrorMessage(t("ayahError", { max: maxAyah }));
      return;
    }

    setIsResolving(true);
    try {
      const params = new URLSearchParams({
        surah: String(selectedSurah.surah),
        startAyah: String(startAyah),
        endAyah: String(endAyah),
      });
      const response = await fetch(`/api/read/resolve-passage?${params.toString()}`);
      const payload = (await response.json()) as PassageLocationResponse;
      const { endPage, startPage } = payload;
      if (
        !response.ok ||
        typeof startPage !== "number" ||
        !Number.isInteger(startPage) ||
        typeof endPage !== "number" ||
        !Number.isInteger(endPage)
      ) {
        setErrorMessage(t("resolveError"));
        return;
      }

      onSelect({
        endAyah,
        endPage,
        label: t("surahPreview", {
          surah: selectedSurah.name,
          start: startAyah,
          end: endAyah,
        }),
        pageNumber: startPage,
        startAyah,
        startPage,
        surah: selectedSurah.surah,
        view,
      });
      closeDialog();
    } catch (error: unknown) {
      console.error("[HifzPassagePicker] Failed to resolve passage", error);
      setErrorMessage(t("resolveError"));
    } finally {
      setIsResolving(false);
    }
  }

  const methods: Array<{ label: string; value: PassageMethod }> = [
    { label: t("surahTab"), value: "surah" },
    { label: t("juzTab"), value: "juz" },
    { label: t("pageTab"), value: "page" },
  ];

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={openDialog}
        disabled={isPending}
        className="ui-touch-target group flex min-h-16 w-full items-center gap-4 rounded-2xl border border-border-strong bg-background px-4 py-3 text-left transition-colors hover:bg-surface-muted disabled:opacity-50"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand-strong">
          <BookOpenIcon />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-foreground">{t("openTitle")}</span>
          <span className="mt-1 block text-xs leading-5 text-muted">{t("openDescription")}</span>
        </span>
        <span className="text-muted transition-transform group-hover:translate-x-0.5">
          <ChevronIcon />
        </span>
      </button>

      {isOpen && typeof document !== "undefined" ? createPortal(
        <div
          ref={overlayRef}
          className="fixed inset-0 z-[80] flex items-end justify-center bg-stone-950/55 px-0 backdrop-blur-sm sm:items-center sm:px-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeDialog();
          }}
        >
          <section
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="passage-picker-title"
            aria-describedby="passage-picker-description"
            tabIndex={-1}
            className="relative max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-surface-solid px-5 pt-5 shadow-[0_-24px_70px_-42px_rgba(0,0,0,0.55)] outline-none sm:max-w-lg sm:rounded-3xl sm:px-7 sm:pt-7"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 id="passage-picker-title" className="text-xl font-bold tracking-[-0.02em] text-foreground">
                  {t("title")}
                </h3>
                <p id="passage-picker-description" className="mt-1 max-w-md text-sm leading-6 text-muted">{t("description")}</p>
              </div>
              <button
                type="button"
                onClick={closeDialog}
                className="ui-touch-target inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
                aria-label={t("close")}
              >
                <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="m6 6 12 12M18 6 6 18" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <div className="mt-5 flex items-center gap-2" aria-label={t("stepProgress", { current: step === "passage" ? 1 : 2 })}>
              <span className="h-1.5 flex-1 rounded-full bg-brand" />
              <span className={`h-1.5 flex-1 rounded-full ${step === "view" ? "bg-brand" : "bg-surface-strong"}`} />
            </div>

            <h4
              ref={stepHeadingRef}
              tabIndex={-1}
              className="mt-5 text-base font-bold text-foreground outline-none"
            >
              {step === "passage" ? t("passageStepTitle") : t("viewStepTitle")}
            </h4>

            {step === "passage" ? (
              <>
                <div className="mt-4 grid grid-cols-3 rounded-xl bg-surface-muted p-1" role="tablist" aria-label={t("methodLabel")}>
                  {methods.map((option, index) => (
                    <button
                      key={option.value}
                      id={`passage-method-${option.value}`}
                      type="button"
                      role="tab"
                      aria-controls={`passage-panel-${option.value}`}
                      aria-selected={method === option.value}
                      tabIndex={method === option.value ? 0 : -1}
                      onKeyDown={(event) => handleMethodKeyDown(event, index)}
                      onClick={() => {
                        setMethod(option.value);
                        setErrorMessage(null);
                      }}
                      className={`ui-touch-target rounded-lg px-3 text-sm font-semibold transition-colors ${
                        method === option.value
                          ? "bg-surface-solid text-foreground shadow-sm"
                          : "text-muted hover:text-foreground"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>

                <div
                  id={`passage-panel-${method}`}
                  role="tabpanel"
                  aria-labelledby={`passage-method-${method}`}
                  className="mt-5"
                >
                  {method === "surah" ? (
                    <div className="space-y-4">
                      <label className="block text-sm font-semibold text-foreground">
                        {t("surahLabel")}
                        <select
                          value={surahNumber}
                          onChange={(event) => updateSurah(Number.parseInt(event.target.value, 10))}
                          className="mt-2 min-h-12 w-full rounded-xl border border-border-strong bg-background px-4 text-base text-foreground outline-none focus:border-brand focus:ring-2 focus:ring-[var(--focus-ring)]"
                        >
                          {surahTargets.map((target) => (
                            <option key={target.surah} value={target.surah}>
                              {target.surah}. {target.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="grid grid-cols-2 gap-3">
                        <label className="text-sm font-semibold text-foreground">
                          {t("startAyahLabel")}
                          <input
                            type="number"
                            inputMode="numeric"
                            min={1}
                            max={maxAyah}
                            value={startAyahInput}
                            onChange={(event) => {
                              setStartAyahInput(event.target.value);
                              setErrorMessage(null);
                            }}
                            className="mt-2 min-h-12 w-full rounded-xl border border-border-strong bg-background px-4 text-base text-foreground outline-none focus:border-brand focus:ring-2 focus:ring-[var(--focus-ring)]"
                          />
                        </label>
                        <label className="text-sm font-semibold text-foreground">
                          {t("endAyahLabel")}
                          <input
                            type="number"
                            inputMode="numeric"
                            min={1}
                            max={maxAyah}
                            value={endAyahInput}
                            onChange={(event) => {
                              setEndAyahInput(event.target.value);
                              setErrorMessage(null);
                            }}
                            className="mt-2 min-h-12 w-full rounded-xl border border-border-strong bg-background px-4 text-base text-foreground outline-none focus:border-brand focus:ring-2 focus:ring-[var(--focus-ring)]"
                          />
                        </label>
                      </div>
                      <div className="flex flex-wrap gap-2" aria-label={t("quickRangeLabel")}>
                        {[1, 3, 5].map((count) => (
                          <button
                            key={count}
                            type="button"
                            onClick={() => setAyahSpan(count)}
                            className="ui-touch-target min-h-10 rounded-lg border border-border-subtle bg-surface-muted px-3 text-xs font-semibold text-foreground transition-colors hover:bg-surface-strong"
                          >
                            {t("ayahCount", { count })}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => setAyahSpan("rest")}
                          className="ui-touch-target min-h-10 rounded-lg border border-border-subtle bg-surface-muted px-3 text-xs font-semibold text-foreground transition-colors hover:bg-surface-strong"
                        >
                          {t("toEnd")}
                        </button>
                      </div>
                      <p className="text-xs text-muted">{t("surahAyahCount", { count: maxAyah })}</p>
                    </div>
                  ) : method === "juz" ? (
                    <label className="block text-sm font-semibold text-foreground">
                      {t("juzLabel")}
                      <select
                        value={juzNumber}
                        onChange={(event) => {
                          setJuzNumber(Number.parseInt(event.target.value, 10));
                          setErrorMessage(null);
                        }}
                        className="mt-2 min-h-12 w-full rounded-xl border border-border-strong bg-background px-4 text-base text-foreground outline-none focus:border-brand focus:ring-2 focus:ring-[var(--focus-ring)]"
                      >
                        {juzTargets.map((target) => (
                          <option key={target.juz} value={target.juz}>
                            {t("juzOption", { juz: target.juz, page: target.page })}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <label className="block text-sm font-semibold text-foreground">
                      {t("pageLabel")}
                      <span className="mt-2 flex min-h-12 items-center rounded-xl border border-border-strong bg-background px-4 focus-within:border-brand focus-within:ring-2 focus-within:ring-[var(--focus-ring)]">
                        <input
                          type="number"
                          inputMode="numeric"
                          min={1}
                          max={604}
                          value={pageInput}
                          onChange={(event) => {
                            setPageInput(event.target.value);
                            setErrorMessage(null);
                          }}
                          className="min-w-0 flex-1 bg-transparent text-base text-foreground outline-none"
                        />
                        <span className="text-sm font-normal text-muted">/ 604</span>
                      </span>
                    </label>
                  )}
                </div>

                {errorMessage ? (
                  <p className="mt-4 text-sm font-medium text-danger" role="alert">{errorMessage}</p>
                ) : null}

                <div className="sticky bottom-0 mt-6 -mx-5 border-t border-border-subtle bg-surface-solid/95 px-5 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4 backdrop-blur-sm sm:-mx-7 sm:px-7 sm:pb-7">
                  <div className="rounded-xl bg-surface-muted px-4 py-3">
                    <p className="text-xs font-semibold text-muted">{t("selectionLabel")}</p>
                    <p className="mt-1 text-sm font-bold text-foreground">{buildPreview()}</p>
                  </div>
                  <button
                    type="button"
                    onClick={continueToView}
                    className="ui-touch-target mt-3 min-h-12 w-full rounded-xl bg-brand px-5 text-sm font-bold text-surface-solid transition-colors hover:bg-brand-strong"
                  >
                    {t("continue")}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="mt-4 rounded-xl bg-surface-muted px-4 py-3">
                  <p className="text-xs font-semibold text-muted">{t("selectionLabel")}</p>
                  <p className="mt-1 text-sm font-bold text-foreground">{buildPreview()}</p>
                </div>

                <div className="mt-5 grid gap-3">
                  {(["ayah", "mushaf"] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={view === option}
                      onClick={() => setView(option)}
                      className={`ui-touch-target min-h-16 rounded-xl border px-4 py-3 text-left transition-colors ${
                        view === option
                          ? "border-brand bg-brand-soft text-brand-strong"
                          : "border-border-subtle bg-background text-muted hover:text-foreground"
                      }`}
                    >
                      <span className="block text-sm font-bold">
                        {option === "ayah" ? t("ayahView") : t("mushafView")}
                      </span>
                      <span className="mt-1 block text-xs leading-5">
                        {option === "ayah" ? t("ayahViewDescription") : t("mushafViewDescription")}
                      </span>
                    </button>
                  ))}
                </div>

                {errorMessage ? (
                  <p className="mt-4 text-sm font-medium text-danger" role="alert">{errorMessage}</p>
                ) : null}

                <div className="sticky bottom-0 mt-6 -mx-5 grid grid-cols-[auto_1fr] gap-3 border-t border-border-subtle bg-surface-solid/95 px-5 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4 backdrop-blur-sm sm:-mx-7 sm:px-7 sm:pb-7">
                  <button
                    type="button"
                    onClick={() => setStep("passage")}
                    className="ui-touch-target min-h-12 rounded-xl border border-border-strong bg-background px-5 text-sm font-bold text-foreground transition-colors hover:bg-surface-muted"
                  >
                    {t("back")}
                  </button>
                  <button
                    type="button"
                    onClick={() => void submitSelection()}
                    disabled={isResolving || isPending}
                    className="ui-touch-target min-h-12 rounded-xl bg-brand px-5 text-sm font-bold text-surface-solid transition-colors hover:bg-brand-strong disabled:cursor-wait disabled:opacity-60"
                  >
                    {isResolving ? t("opening") : t("start")}
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      , document.body) : null}
    </>
  );
}
