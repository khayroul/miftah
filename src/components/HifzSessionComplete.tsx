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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-stone-900/80 backdrop-blur-sm">
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

      <div className="mx-4 w-full max-w-sm rounded-3xl border border-stone-200/50 bg-white p-8 text-center shadow-2xl dark:border-stone-700/50 dark:bg-stone-900">
        <p className="text-4xl">&#127775;</p>
        <h2 className="mt-3 text-2xl font-bold text-stone-900 dark:text-stone-100">
          Alhamdulillah!
        </h2>
        <p className="mt-2 text-sm text-stone-600 dark:text-stone-300">
          Sesi {label} selesai
        </p>

        <div className="mt-6 flex justify-center gap-6 text-center">
          <div>
            <p className="text-2xl font-bold text-teal-600 dark:text-teal-400">
              {pagesCompleted}
            </p>
            <p className="text-xs text-stone-500 dark:text-stone-400">
              Halaman
            </p>
          </div>
          <div>
            <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
              {formatDuration(timeElapsedMs)}
            </p>
            <p className="text-xs text-stone-500 dark:text-stone-400">
              Masa
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => router.push("/hifz")}
          className="mt-8 w-full rounded-xl bg-teal-600 px-6 py-3.5 text-base font-semibold text-white shadow-sm transition hover:bg-teal-700 active:bg-teal-800"
        >
          Kembali ke Hafal
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
