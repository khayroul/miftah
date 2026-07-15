import type { FahamStatsStatus } from "./useFahamWorkspaceState";

function formatMetricValue(value: number): string {
  return value.toLocaleString();
}

function metricValue(
  value: number,
  hasLiveStats: boolean,
  statsStatus: FahamStatsStatus,
): string {
  if (hasLiveStats) return formatMetricValue(value);
  return statsStatus === "loading" ? "..." : "—";
}

export function FahamStatsPanel({
  foundCap,
  foundCount,
  hasLiveStats,
  masteredCount,
  statsStatus,
}: {
  foundCap: number;
  foundCount: number;
  hasLiveStats: boolean;
  masteredCount: number;
  statsStatus: FahamStatsStatus;
}) {
  const foundShare = foundCap > 0 ? Math.min(1, foundCount / foundCap) : 0;
  const masteredShare =
    foundCount > 0 ? Math.min(1, masteredCount / foundCount) : 0;

  return (
    <section className="grid grid-cols-2 gap-2 sm:gap-3">
      <MotivationMetricCard
        label="Ditemui"
        progress={foundShare}
        progressLabel={
          foundCap > 0
            ? `${formatMetricValue(foundCount)}/${formatMetricValue(foundCap)} cap`
            : "Tiada cap"
        }
        value={metricValue(foundCount, hasLiveStats, statsStatus)}
      />
      <MotivationMetricCard
        label="Dikuasai"
        progress={masteredShare}
        progressLabel={
          foundCount > 0
            ? `${formatMetricValue(masteredCount)}/${formatMetricValue(foundCount)} ditemui`
            : "Belum mula"
        }
        value={metricValue(masteredCount, hasLiveStats, statsStatus)}
      />
    </section>
  );
}

function MotivationMetricCard({
  label,
  progress,
  progressLabel,
  value,
}: {
  label: string;
  progress: number;
  progressLabel: string;
  value: string;
}) {
  const palette = {
    card:
      "border-emerald-300/70 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.18),transparent_55%),linear-gradient(180deg,rgba(236,253,245,0.95),rgba(255,255,255,0.98))] dark:border-emerald-500/35 dark:bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.22),transparent_55%),linear-gradient(180deg,rgba(2,44,34,0.50),rgba(28,25,23,0.92))]",
    progressBadge:
      "border-emerald-400/70 bg-emerald-100/90 text-emerald-900 dark:border-emerald-400/40 dark:bg-emerald-300/15 dark:text-emerald-50",
    progressBar: "bg-emerald-500 dark:bg-emerald-400",
    progressTrack: "bg-emerald-100 dark:bg-emerald-900/30",
    value: "text-emerald-950 dark:text-emerald-50",
  };

  return (
    <section
      className={`min-w-0 rounded-[1.5rem] border p-4 shadow-[0_20px_60px_-44px_rgba(41,37,36,0.55)] sm:p-5 ${palette.card}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-stone-500 sm:text-xs dark:text-stone-400">
            {label}
          </p>
          <p
            className={`mt-2 text-3xl font-semibold tracking-tight sm:text-4xl ${palette.value}`}
          >
            {value}
          </p>
        </div>

        <div
          className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold shadow-sm sm:px-3 sm:text-sm ${palette.progressBadge}`}
        >
          {Math.round(progress * 100)}%
        </div>
      </div>

      <div className="mt-4">
        <div className={`h-2 rounded-full ${palette.progressTrack}`}>
          <div
            className={`h-full rounded-full transition-[width] duration-500 ${palette.progressBar}`}
            style={{
              width: `${Math.min(100, Math.max(0, progress * 100))}%`,
            }}
          />
        </div>
        <p className="mt-2 text-[11px] font-medium leading-tight text-stone-600 sm:text-xs dark:text-stone-300">
          {progressLabel}
        </p>
      </div>
    </section>
  );
}
