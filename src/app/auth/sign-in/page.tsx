import Link from "next/link";
import { redirect } from "next/navigation";
import { sanitizeNextPath } from "@/lib/auth";
import { getOptionalAuthUser } from "@/lib/auth-server";
import { AuthSignInForm } from "@/components/AuthSignInForm";
import { ThemeToggle } from "@/components/ThemeToggle";

interface SignInPageProps {
  searchParams: Promise<{
    error?: string;
    next?: string;
  }>;
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const user = await getOptionalAuthUser();
  const params = await searchParams;
  const nextPath = sanitizeNextPath(params.next, "/");

  if (user) {
    redirect(nextPath);
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_14%_10%,rgba(180,83,9,0.18),transparent_28%),radial-gradient(circle_at_82%_0%,rgba(20,94,89,0.18),transparent_34%)] dark:bg-[radial-gradient(circle_at_14%_10%,rgba(217,119,6,0.18),transparent_28%),radial-gradient(circle_at_82%_0%,rgba(15,118,110,0.22),transparent_34%)]" />

      <main className="relative mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-8 px-4 py-8 sm:px-6 lg:py-12">
        <header className="flex items-center justify-between gap-3">
          <Link
            href={nextPath}
            className="flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-4 py-1.5 text-sm font-medium text-stone-700 shadow-sm transition hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700"
          >
            &larr; Kembali
          </Link>
          <ThemeToggle />
        </header>

        <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[32px] border border-stone-200/90 bg-white/82 p-6 shadow-[0_28px_90px_-48px_rgba(28,25,23,0.55)] backdrop-blur-sm sm:p-8 dark:border-stone-700 dark:bg-stone-900/78">
            <div className="inline-flex items-center rounded-full border border-amber-900/15 bg-amber-100/75 px-3 py-1 text-xs font-medium tracking-wide text-amber-900 dark:border-amber-300/20 dark:bg-amber-900/35 dark:text-amber-100">
              Akaun Miftah
            </div>

            <h1 className="mt-6 text-3xl font-medium tracking-tight text-stone-900 sm:text-4xl dark:text-stone-50">
              Masuk ke akaun anda.
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-stone-600 dark:text-stone-300">
              Masuk atau cipta akaun untuk simpan progres Faham, Hafal, Tema,
              dan dashboard anda. Baca masih boleh digunakan tanpa akaun,
              tetapi progresnya hanya tersimpan pada browser semasa.
            </p>

            {params.error ? (
              <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
                Pautan masuk itu tidak sah atau sudah tamat tempoh. Minta pautan
                baru di bawah, atau guna password jika anda sudah pernah
                menetapkannya.
              </p>
            ) : null}

            <div className="mt-8">
              <AuthSignInForm nextPath={nextPath} />
            </div>
          </div>

          <aside className="rounded-[28px] border border-stone-200/80 bg-stone-50/88 p-6 dark:border-stone-700 dark:bg-stone-950/60">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-stone-500 dark:text-stone-400">
              Apa yang disimpan
            </p>
            <div className="mt-4 space-y-3 text-sm text-stone-600 dark:text-stone-300">
              <p>
                <span className="font-medium text-stone-800 dark:text-stone-100">
                  Baca
                </span>
                : halaman terakhir dan aktiviti membaca.
              </p>
              <p>
                <span className="font-medium text-stone-800 dark:text-stone-100">
                  Faham
                </span>
                : queue WBW, review log, dan exposure.
              </p>
              <p>
                <span className="font-medium text-stone-800 dark:text-stone-100">
                  Tema
                </span>
                : chunk yang sudah dibuka dan progres penerokaan.
              </p>
              <p>
                <span className="font-medium text-stone-800 dark:text-stone-100">
                  Hafal
                </span>
                : Sabak, Sabqi, Manzil, dan FSRS ayat.
              </p>
              <p>
                Belum mahu masuk? Anda masih boleh lihat rupa pengalaman Miftah
                melalui{" "}
                <span className="font-medium text-stone-800 dark:text-stone-100">
                  Pratonton
                </span>
                .
              </p>
            </div>
          </aside>
        </section>
      </main>
    </div>
  );
}
