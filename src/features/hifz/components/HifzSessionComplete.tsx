"use client";

import { useRouter } from "next/navigation";

interface HifzSessionCompleteProps {
  flow: "memorize" | "review";
  pagesCompleted: number;
  timeElapsedMs: number;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

const CONFETTI_COLORS = [
  "bg-amber-400",
  "bg-teal-400",
  "bg-emerald-400",
  "bg-rose-400",
  "bg-sky-400",
  "bg-violet-400",
  "bg-amber-300",
  "bg-teal-300",
];

export function HifzSessionComplete({
  flow,
  pagesCompleted,
  timeElapsedMs,
}: HifzSessionCompleteProps) {
  const router = useRouter();
  const label = flow === "memorize" ? "hafalan" : "ulang kaji";
  const guidance =
    flow === "memorize"
      ? "Rekod sesi telah disimpan. Kembali ke Hafal untuk lihat ayat yang perlu dikukuhkan selepas ini."
      : "Ulang kaji telah disimpan. Kembali ke Hafal untuk lihat tugasan yang masih perlu diberi perhatian.";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-stone-950/70 px-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="hifz-session-complete-title"
      aria-describedby="hifz-session-complete-guidance"
    >
      {/* CSS confetti */}
      {CONFETTI_COLORS.map((color, i) => (
        <span
          key={i}
          className={`absolute h-2 w-2 rounded-sm ${color} opacity-80`}
          style={{
            left: `${10 + i * 10}%`,
            top: "-8px",
            animation: `confetti-fall ${2 + (i % 3) * 0.5}s ease-in ${i * 0.15}s infinite`,
          }}
        />
      ))}

      <div className="ui-surface-solid w-full max-w-sm rounded-[2rem] p-7 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-soft text-brand">
          <svg
            aria-hidden="true"
            className="h-7 w-7"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.25"
          >
            <path
              d="m5 12 4 4L19 6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <p className="ui-eyebrow mt-4">Sesi disimpan</p>
        <h2
          id="hifz-session-complete-title"
          className="mt-2 text-2xl font-bold text-foreground"
        >
          Alhamdulillah!
        </h2>
        <p className="mt-2 text-sm text-muted">
          Sesi {label} selesai
        </p>

        <div className="mt-6 grid grid-cols-2 gap-3 text-center">
          <div className="rounded-2xl bg-surface-muted px-3 py-4">
            <p className="text-2xl font-bold text-brand">
              {pagesCompleted}
            </p>
            <p className="mt-1 text-xs font-medium text-muted">
              Halaman
            </p>
          </div>
          <div className="rounded-2xl bg-surface-muted px-3 py-4">
            <p className="text-2xl font-bold text-accent">
              {formatDuration(timeElapsedMs)}
            </p>
            <p className="mt-1 text-xs font-medium text-muted">
              Masa
            </p>
          </div>
        </div>

        <p
          id="hifz-session-complete-guidance"
          className="mt-5 text-sm leading-relaxed text-muted"
        >
          {guidance}
        </p>

        <button
          type="button"
          onClick={() => router.push("/hifz")}
          className="ui-touch-target mt-6 w-full touch-manipulation rounded-xl bg-brand px-6 py-3.5 text-base font-semibold text-white transition-colors hover:bg-brand-strong dark:text-slate-950"
        >
          Lihat langkah seterusnya
        </button>
      </div>

      <style jsx>{`
        @keyframes confetti-fall {
          0% {
            transform: translateY(0) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translateY(100vh) rotate(720deg);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}
