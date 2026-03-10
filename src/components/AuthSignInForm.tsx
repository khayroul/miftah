"use client";

import { useState, useTransition } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase-auth";

export function AuthSignInForm({
  nextPath,
}: {
  nextPath: string;
}) {
  const [email, setEmail] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!email.trim()) {
      setErrorMessage("Masukkan email dahulu.");
      return;
    }

    startTransition(() => {
      const supabase = createSupabaseBrowserClient();
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`;

      void supabase.auth
        .signInWithOtp({
          email: email.trim(),
          options: {
            emailRedirectTo: redirectTo,
          },
        })
        .then(({ error }) => {
          if (error) {
            setErrorMessage("Gagal hantar pautan sign in.");
            setFeedback(null);
            return;
          }

          setErrorMessage(null);
          setFeedback("Pautan sign in sudah dihantar ke email anda.");
        });
    });
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <label className="block text-sm font-medium text-stone-700 dark:text-stone-200">
        Email
        <input
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="mt-2 w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-sm text-stone-900 outline-none transition focus:border-amber-500 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100 dark:focus:border-amber-500"
          placeholder="you@example.com"
        />
      </label>

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-2xl bg-amber-600 px-4 py-3 text-sm font-medium text-amber-50 transition hover:bg-amber-500 disabled:opacity-60 dark:bg-amber-500 dark:hover:bg-amber-400"
      >
        {isPending ? "Menghantar..." : "Hantar Pautan Sign In"}
      </button>

      {feedback ? (
        <p className="rounded-2xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800 dark:border-teal-900/40 dark:bg-teal-900/20 dark:text-teal-200">
          {feedback}
        </p>
      ) : null}

      {errorMessage ? (
        <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
          {errorMessage}
        </p>
      ) : null}
    </form>
  );
}
