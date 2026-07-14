import type { Metadata } from "next";
import { TasmiJuzukExam } from "@/features/tasmi";
import { requireAuthUser } from "@/features/auth/server";

export const metadata: Metadata = {
  title: "Ujian Juzuk — Tasmi' | Miftah",
};

export default async function TasmiJuzukPage() {
  // The whole flow (round picker, transcription, session save) is
  // authenticated — gate the page instead of failing per-request inside.
  await requireAuthUser("/tasmi/juzuk");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 px-4 py-8">
      <header className="text-center">
        <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-50">
          Ujian Juzuk
        </h1>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
          Tasmi&apos; — semak hafalan anda juzuk demi juzuk
        </p>
      </header>
      <TasmiJuzukExam />
    </main>
  );
}
