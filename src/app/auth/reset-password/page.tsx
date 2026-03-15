"use client";

import Link from "next/link";
import { Suspense, useEffect, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase-auth";
import { ThemeToggle } from "@/components/ThemeToggle";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const hasError = searchParams.get("error") === "callback";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(
    hasError
      ? "Pautan reset tidak sah atau sudah tamat tempoh. Minta pautan baru."
      : null,
  );
  const [isPending, startTransition] = useTransition();
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    // Handle the token hash from Supabase recovery email
    // Supabase appends #access_token=...&type=recovery to the redirect URL
    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setHasSession(true);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session)) {
        setHasSession(true);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (password.length < 6) {
      setErrorMessage("Password sekurang-kurangnya 6 aksara.");
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage("Password tidak sepadan.");
      return;
    }

    startTransition(() => {
      const supabase = createSupabaseBrowserClient();
      void supabase.auth.updateUser({ password }).then(({ error }) => {
        if (error) {
          setErrorMessage(`Gagal tukar password: ${error.message}`);
          setFeedback(null);
          return;
        }

        setErrorMessage(null);
        setFeedback("Password berjaya ditukar! Anda boleh masuk sekarang.");
      });
    });
  }

  const inputCls =
    "mt-2 w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-sm text-stone-900 outline-none transition focus:border-amber-500 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100 dark:focus:border-amber-500";
  const labelCls =
    "block text-sm font-medium text-stone-700 dark:text-stone-200";

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_14%_10%,rgba(180,83,9,0.18),transparent_28%),radial-gradient(circle_at_82%_0%,rgba(20,94,89,0.18),transparent_34%)] dark:bg-[radial-gradient(circle_at_14%_10%,rgba(217,119,6,0.18),transparent_28%),radial-gradient(circle_at_82%_0%,rgba(15,118,110,0.22),transparent_34%)]" />

      <main className="relative mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-8 px-4 py-8 sm:px-6 lg:py-12">
        <header className="flex items-center justify-between gap-3">
          <Link
            href="/auth/sign-in"
            className="flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-4 py-1.5 text-sm font-medium text-stone-700 shadow-sm transition hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700"
          >
            &larr; Masuk
          </Link>
          <ThemeToggle />
        </header>

        <section className="mx-auto w-full max-w-2xl">
          <div className="rounded-[32px] border border-stone-200/90 bg-white/82 p-6 shadow-[0_28px_90px_-48px_rgba(28,25,23,0.55)] backdrop-blur-sm sm:p-8 dark:border-stone-700 dark:bg-stone-900/78">
            <div className="inline-flex items-center rounded-full border border-amber-900/15 bg-amber-100/75 px-3 py-1 text-xs font-medium tracking-wide text-amber-900 dark:border-amber-300/20 dark:bg-amber-900/35 dark:text-amber-100">
              Reset Password
            </div>

            <h1 className="mt-6 text-3xl font-medium tracking-tight text-stone-900 sm:text-4xl dark:text-stone-50">
              Tetapkan password baru.
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-stone-600 dark:text-stone-300">
              Masukkan password baru untuk akaun anda.
            </p>

            {feedback ? (
              <div className="mt-6 space-y-4">
                <p className="rounded-2xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800 dark:border-teal-900/40 dark:bg-teal-900/20 dark:text-teal-200">
                  {feedback}
                </p>
                <Link
                  href="/auth/sign-in"
                  className="inline-flex rounded-2xl bg-amber-600 px-6 py-3 text-sm font-medium text-amber-50 transition hover:bg-amber-500 dark:bg-amber-500 dark:hover:bg-amber-400"
                >
                  Masuk Sekarang
                </Link>
              </div>
            ) : hasSession ? (
              <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
                <label className={labelCls}>
                  Password Baru
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={inputCls}
                    placeholder="Min. 6 aksara"
                  />
                </label>

                <label className={labelCls}>
                  Sahkan Password Baru
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className={inputCls}
                    placeholder="Ulang password"
                  />
                </label>

                <button
                  type="submit"
                  disabled={isPending}
                  className="w-full rounded-2xl bg-amber-600 px-4 py-3 text-sm font-medium text-amber-50 transition hover:bg-amber-500 disabled:opacity-60 dark:bg-amber-500 dark:hover:bg-amber-400"
                >
                  {isPending ? "Menukar..." : "Tukar Password"}
                </button>

                {errorMessage ? (
                  <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
                    {errorMessage}
                  </p>
                ) : null}
              </form>
            ) : (
              <div className="mt-6 space-y-4">
                {errorMessage ? (
                  <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
                    {errorMessage}
                  </p>
                ) : (
                  <p className="text-sm text-stone-600 dark:text-stone-300">
                    Sedang memproses pautan reset...
                  </p>
                )}
                <Link
                  href="/auth/forgot-password"
                  className="inline-flex rounded-2xl border border-stone-300 px-6 py-3 text-sm font-medium text-stone-700 transition hover:bg-stone-100 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-800"
                >
                  Minta Pautan Baru
                </Link>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
