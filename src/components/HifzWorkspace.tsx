"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { JuzHeatmap } from "@/components/JuzHeatmap";
import { HifzSessionCard } from "@/components/HifzSessionCard";
import type { DailyPlanWithDetails, PlanItem } from "@/lib/hifz/scheduler";
import type { JuzStat, HifzStats } from "@/lib/hifz/stats";
import type { FsrsRating } from "@/types/database";

interface HifzWorkspaceProps {
  plan: DailyPlanWithDetails;
  stats: HifzStats;
  juzProgress: JuzStat[];
}

type SessionState = "overview" | "in-session" | "complete";

// Flatten plan into an ordered queue: sabqi → sabak → manzil
function buildQueue(plan: DailyPlanWithDetails): Array<{ item: PlanItem; block: "sabqi" | "sabak" | "manzil" }> {
  return [
    ...plan.sabqi.map((item) => ({ item, block: "sabqi" as const })),
    ...plan.sabak.map((item) => ({ item, block: "sabak" as const })),
    ...plan.manzil.map((item) => ({ item, block: "manzil" as const })),
  ];
}

export function HifzWorkspace({ plan, stats, juzProgress }: HifzWorkspaceProps) {
  const queue = buildQueue(plan);
  const total = queue.length;

  const [sessionState, setSessionState] = useState<SessionState>("overview");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [reviewedCount, setReviewedCount] = useState(0);

  const handleRate = useCallback(
    async (rating: FsrsRating) => {
      const entry = queue[currentIndex];
      if (!entry) return;

      setIsLoading(true);
      try {
        await fetch("/api/hifz/rate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            progressId: entry.item.progress.id,
            rating,
            block: entry.block,
          }),
        });
      } catch {
        // Silently continue — don't block the user if API fails
      } finally {
        setIsLoading(false);
      }

      const next = currentIndex + 1;
      setReviewedCount((c) => c + 1);
      if (next >= total) {
        setSessionState("complete");
      } else {
        setCurrentIndex(next);
      }
    },
    [currentIndex, queue, total],
  );

  const handleStart = useCallback(() => {
    if (total === 0) return;
    setCurrentIndex(0);
    setReviewedCount(0);
    setSessionState("in-session");
  }, [total]);

  // ── Overview ─────────────────────────────────────────────────
  if (sessionState === "overview") {
    return (
      <div className="flex flex-col gap-5">
        {/* Main card: today's plan + heatmap */}
        <section className="animate-fade-in-up rounded-3xl border border-stone-200/90 bg-white/85 p-5 shadow-[0_25px_70px_-48px_rgba(28,25,23,0.55)] backdrop-blur-sm sm:p-7 dark:border-stone-700 dark:bg-stone-900/78 dark:shadow-[0_25px_70px_-48px_rgba(2,6,23,0.9)]">
          <div className="grid gap-8 lg:grid-cols-[1.2fr_1fr]">
            {/* Left: session info */}
            <div className="space-y-5">
              <div className="inline-flex items-center rounded-full border border-teal-900/15 bg-teal-950/5 px-3 py-1 text-xs font-medium tracking-wide text-teal-900/80 dark:border-teal-300/20 dark:bg-teal-900/40 dark:text-teal-100">
                Fasa 3 · Enjin Hafal
              </div>

              <div>
                <h1 className="text-2xl font-medium tracking-tight text-stone-900 sm:text-3xl dark:text-stone-50">
                  Hafazan Hari Ini
                </h1>
                <p className="mt-1 text-sm text-stone-600 dark:text-stone-300">
                  Sabak · Sabqi · Manzil — sistem hafazan tradisional
                </p>
              </div>

              {/* Block breakdown */}
              <div className="space-y-2">
                <BlockRow
                  label="Sabqi"
                  sublabel="Ulangkaji baru (7 hari)"
                  count={plan.sabqi.length}
                  colorClass="text-teal-700 dark:text-teal-400"
                />
                <BlockRow
                  label="Sabak"
                  sublabel="Hafalan baru hari ini"
                  count={plan.sabak.length}
                  colorClass="text-amber-700 dark:text-amber-400"
                />
                <BlockRow
                  label="Manzil"
                  sublabel="Ulangkaji jangka panjang"
                  count={plan.manzil.length}
                  colorClass="text-indigo-700 dark:text-indigo-400"
                />
              </div>

              {/* Stats row */}
              <div className="flex flex-wrap gap-3 text-xs text-stone-500 dark:text-stone-400">
                <span className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1 dark:border-stone-700 dark:bg-stone-800">
                  {stats.totalManzil} ayat hafal
                </span>
                <span className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1 dark:border-stone-700 dark:bg-stone-800">
                  {stats.streak} hari berturut
                </span>
                {stats.dueTodayCount > 0 && (
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-amber-700 dark:border-amber-800/40 dark:bg-amber-900/20 dark:text-amber-300">
                    {stats.dueTodayCount} perlu ulangkaji
                  </span>
                )}
              </div>

              {/* Start button */}
              {total > 0 ? (
                <button
                  type="button"
                  onClick={handleStart}
                  className="rounded-xl bg-teal-900 px-5 py-2.5 text-sm font-medium text-teal-50 transition hover:bg-teal-800 dark:bg-teal-700 dark:hover:bg-teal-600"
                >
                  Mulakan Sesi ({total} ayat) →
                </button>
              ) : (
                <div className="rounded-xl border border-stone-200 bg-stone-50 px-5 py-3 text-sm text-stone-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-400">
                  Tiada ayat untuk ulang kaji hari ini. Sambung semula esok.
                </div>
              )}
            </div>

            {/* Right: juz heatmap */}
            <aside className="animate-fade-in-up-delay rounded-2xl border border-stone-200/80 bg-stone-50/90 p-4 dark:border-stone-700 dark:bg-stone-900/85">
              <JuzHeatmap juzProgress={juzProgress} />
            </aside>
          </div>
        </section>

        {/* Bottom info cards */}
        <section
          className="grid gap-3 sm:grid-cols-3"
          style={{ animationDelay: "140ms" }}
        >
          <InfoCard
            title="Sabak"
            desc="Hafalan baru. Baca dan hafal. Nilai sebagai Hafal apabila mampu mengulang."
          />
          <InfoCard
            title="Sabqi"
            desc="Hafalan minggu ini. Ulangkaji setiap hari untuk kukuhkan ingatan jangka pendek."
          />
          <InfoCard
            title="Manzil"
            desc="Hafalan lama. Sistem FSRS menentukan bila perlu ulangkaji untuk ingatan kekal."
          />
        </section>
      </div>
    );
  }

  // ── In Session ───────────────────────────────────────────────
  if (sessionState === "in-session") {
    const entry = queue[currentIndex];
    if (!entry) return null;
    const mushafHref = `/read/${entry.item.ayah.pageNumber}?mode=hifz&from=hifz&block=${entry.block}&ayah=${entry.item.ayah.surahId}:${entry.item.ayah.ayahNumber}`;

    return (
      <div className="flex flex-col gap-4">
        {/* Session header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSessionState("overview")}
              className="flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-4 py-1.5 text-sm font-medium text-stone-700 shadow-sm transition hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700"
            >
              &larr; Ringkasan
            </button>
            <Link
              href={mushafHref}
              prefetch={false}
              className="rounded-full border border-teal-300 bg-teal-50 px-4 py-1.5 text-sm font-medium text-teal-800 transition hover:bg-teal-100 dark:border-teal-700/50 dark:bg-teal-900/30 dark:text-teal-100 dark:hover:bg-teal-900/45"
            >
              Buka di Mushaf
            </Link>
          </div>
          <span className="text-xs text-stone-500 dark:text-stone-400">
            {reviewedCount} selesai
          </span>
        </div>

        <HifzSessionCard
          item={entry.item}
          block={entry.block}
          index={currentIndex}
          total={total}
          isLoading={isLoading}
          onRate={handleRate}
        />
      </div>
    );
  }

  // ── Complete ─────────────────────────────────────────────────
  return (
    <div className="animate-fade-in-up rounded-3xl border border-stone-200/90 bg-white/85 p-8 text-center shadow-[0_25px_70px_-48px_rgba(28,25,23,0.55)] backdrop-blur-sm dark:border-stone-700 dark:bg-stone-900/78">
      <p className="text-4xl font-arabic mb-3">الحمد لله</p>
      <h2 className="text-xl font-medium text-stone-900 dark:text-stone-100">
        Sesi Selesai!
      </h2>
      <p className="mt-2 text-sm text-stone-600 dark:text-stone-300">
        {reviewedCount} ayat telah diulang kaji. Teruskan istiqamah.
      </p>
      <div className="mt-6 flex justify-center gap-3">
        <button
          type="button"
          onClick={() => setSessionState("overview")}
          className="rounded-xl border border-stone-300 bg-white px-5 py-2.5 text-sm font-medium text-stone-700 transition hover:bg-stone-100 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
        >
          Kembali ke Ringkasan
        </button>
      </div>
    </div>
  );
}

function BlockRow({
  label,
  sublabel,
  count,
  colorClass,
}: {
  label: string;
  sublabel: string;
  count: number;
  colorClass: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-stone-100 bg-stone-50/80 px-4 py-2.5 dark:border-stone-800 dark:bg-stone-900/50">
      <div>
        <span className={`text-sm font-semibold ${colorClass}`}>{label}</span>
        <span className="ml-2 text-xs text-stone-500 dark:text-stone-400">
          {sublabel}
        </span>
      </div>
      <span className="text-sm font-bold text-stone-700 dark:text-stone-200">
        {count} ayat
      </span>
    </div>
  );
}

function InfoCard({ title, desc }: { title: string; desc: string }) {
  return (
    <article className="animate-fade-in-up rounded-2xl border border-stone-200/85 bg-white/80 p-4 shadow-[0_12px_36px_-28px_rgba(28,25,23,0.45)] backdrop-blur-sm dark:border-stone-700 dark:bg-stone-900/78 dark:shadow-[0_12px_36px_-28px_rgba(2,6,23,0.85)]">
      <h3 className="text-sm font-semibold tracking-wide text-stone-900 dark:text-stone-100">
        {title}
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-stone-600 dark:text-stone-300">
        {desc}
      </p>
    </article>
  );
}
