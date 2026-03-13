"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  buildMagicLinkPath,
  formatCooldownDuration,
  getMagicLinkCooldownSeconds,
  type AuthErrorLike,
} from "@/lib/auth";
import { createSupabaseBrowserClient } from "@/lib/supabase-auth";

type AuthTab = "sign-in" | "sign-up";
type SignInMode = "password" | "magic-link";

const MAGIC_LINK_COOLDOWN_STORAGE_KEY = "miftah.auth.magic-link-cooldown-until";
const PREVIEW_PATH = "/dashboard-preview";

function buildEmailAuthRedirectUrl(nextPath: string): string {
  return `${window.location.origin}${buildMagicLinkPath(nextPath)}`;
}

function formatMagicLinkError(error: AuthErrorLike | null): string {
  if (!error) {
    return "Kami belum dapat hantar pautan masuk sekarang.";
  }

  if (error.code === "email_address_invalid") {
    return "Alamat email nampak tidak sah. Semak semula dan cuba lagi.";
  }

  if (error.message) {
    return `Kami belum dapat hantar pautan masuk: ${error.message}`;
  }

  return "Kami belum dapat hantar pautan masuk sekarang.";
}

function formatPasswordError(error: AuthErrorLike | null): string {
  if (error?.message === "Invalid login credentials") {
    return "Email atau password tidak sepadan.";
  }

  if (error?.message) {
    return `Masuk dengan password belum berjaya: ${error.message}`;
  }

  return "Masuk dengan password belum berjaya. Cuba lagi sebentar lagi.";
}

export function AuthSignInForm({
  nextPath,
}: {
  nextPath: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<AuthTab>("sign-in");
  const [signInMode, setSignInMode] = useState<SignInMode>("magic-link");

  // Shared fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Sign-up only
  const [displayName, setDisplayName] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [magicLinkCooldownUntil, setMagicLinkCooldownUntil] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [isPending, startTransition] = useTransition();

  const magicLinkCooldownSeconds =
    magicLinkCooldownUntil === null
      ? 0
      : Math.max(0, Math.ceil((magicLinkCooldownUntil - nowMs) / 1000));
  const isMagicLinkCoolingDown =
    signInMode === "magic-link" && magicLinkCooldownSeconds > 0;

  useEffect(() => {
    const storedValue = window.localStorage.getItem(MAGIC_LINK_COOLDOWN_STORAGE_KEY);
    if (!storedValue) {
      return;
    }

    const parsedValue = Number(storedValue);
    if (!Number.isFinite(parsedValue) || parsedValue <= Date.now()) {
      window.localStorage.removeItem(MAGIC_LINK_COOLDOWN_STORAGE_KEY);
      return;
    }

    setMagicLinkCooldownUntil(parsedValue);
  }, []);

  useEffect(() => {
    if (magicLinkCooldownUntil === null) {
      return;
    }

    if (magicLinkCooldownUntil <= Date.now()) {
      clearMagicLinkCooldown();
      return;
    }

    const intervalId = window.setInterval(() => {
      const nextNow = Date.now();
      setNowMs(nextNow);

      if (magicLinkCooldownUntil <= nextNow) {
        clearMagicLinkCooldown();
      }
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [magicLinkCooldownUntil]);

  function reset() {
    setFeedback(null);
    setErrorMessage(null);
  }

  function clearMagicLinkCooldown() {
    setMagicLinkCooldownUntil(null);
    window.localStorage.removeItem(MAGIC_LINK_COOLDOWN_STORAGE_KEY);
  }

  function startMagicLinkCooldown(seconds: number) {
    const cooldownUntil = Date.now() + seconds * 1000;
    setNowMs(Date.now());
    setMagicLinkCooldownUntil(cooldownUntil);
    window.localStorage.setItem(
      MAGIC_LINK_COOLDOWN_STORAGE_KEY,
      cooldownUntil.toString(),
    );
  }

  function switchTab(next: AuthTab) {
    setTab(next);
    reset();
    setPassword("");
    setConfirmPassword("");
  }

  function switchSignInMode(next: SignInMode) {
    setSignInMode(next);
    reset();
    setPassword("");
  }

  // ── Sign In ──────────────────────────────────────────────────────────────
  function handleSignIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!email.trim()) {
      setErrorMessage("Masukkan email dahulu.");
      return;
    }

    if (signInMode === "password" && !password) {
      setErrorMessage("Masukkan password dahulu.");
      return;
    }

    if (signInMode === "magic-link" && isMagicLinkCoolingDown) {
      setFeedback(null);
      setErrorMessage(
        `Tunggu ${formatCooldownDuration(magicLinkCooldownSeconds)} lagi sebelum minta pautan baru.`,
      );
      return;
    }

    startTransition(() => {
      const supabase = createSupabaseBrowserClient();

      if (signInMode === "password") {
        void supabase.auth
          .signInWithPassword({ email: email.trim(), password })
          .then(({ error }) => {
            if (error) {
              setErrorMessage(formatPasswordError(error));
              setFeedback(null);
              return;
            }
            setErrorMessage(null);
            router.push(nextPath);
            router.refresh();
          });
      } else {
        const redirectTo = buildEmailAuthRedirectUrl(nextPath);
        void supabase.auth
          .signInWithOtp({
            email: email.trim(),
            options: { emailRedirectTo: redirectTo },
          })
          .then(({ error }) => {
            if (error) {
              const cooldownSeconds = getMagicLinkCooldownSeconds(error);

              if (cooldownSeconds !== null) {
                startMagicLinkCooldown(cooldownSeconds);
                setErrorMessage(
                  `Terlalu banyak percubaan sebentar tadi. Cuba lagi dalam ${formatCooldownDuration(cooldownSeconds)}, atau guna password jika akaun anda sudah ada.`,
                );
              } else {
                setErrorMessage(formatMagicLinkError(error));
              }
              setFeedback(null);
              return;
            }

            clearMagicLinkCooldown();
            setErrorMessage(null);
            setFeedback(
              "Pautan masuk sudah dihantar. Semak Inbox, Spam, atau Promotions, kemudian tekan pautan itu untuk masuk ke Miftah.",
            );
          });
      }
    });
  }

  // ── Sign Up ──────────────────────────────────────────────────────────────
  function handleSignUp(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!displayName.trim()) {
      setErrorMessage("Masukkan nama paparan anda.");
      return;
    }
    if (!email.trim()) {
      setErrorMessage("Masukkan email anda.");
      return;
    }
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
      const emailRedirectTo = buildEmailAuthRedirectUrl(nextPath);
      void supabase.auth
        .signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo,
            data: { display_name: displayName.trim() },
          },
        })
        .then(({ data, error }) => {
          if (error) {
            setErrorMessage(`Gagal daftar: ${error.message}`);
            setFeedback(null);
            return;
          }

          // If email confirmation is required, user will be null
          if (!data.session) {
            setErrorMessage(null);
            setFeedback(
              "Akaun berjaya dicipta! Semak email anda untuk sahkan akaun, kemudian sign in.",
            );
            return;
          }

          // Auto signed-in
          setErrorMessage(null);
          router.push(nextPath);
          router.refresh();
        });
    });
  }

  // ── Shared input style ────────────────────────────────────────────────────
  const inputCls =
    "mt-2 w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-sm text-stone-900 outline-none transition focus:border-amber-500 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100 dark:focus:border-amber-500";
  const labelCls = "block text-sm font-medium text-stone-700 dark:text-stone-200";

  return (
    <div className="space-y-5">
      {/* Tab switcher */}
      <div className="flex rounded-2xl border border-stone-200 bg-stone-100 p-1 dark:border-stone-700 dark:bg-stone-800">
        {(["sign-in", "sign-up"] as AuthTab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => switchTab(t)}
            className={[
              "flex-1 rounded-xl py-2 text-sm font-medium transition",
              tab === t
                ? "bg-white shadow-sm dark:bg-stone-700 text-stone-900 dark:text-stone-50"
                : "text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200",
            ].join(" ")}
          >
            {t === "sign-in" ? "Masuk" : "Daftar"}
          </button>
        ))}
      </div>

      {/* ── Sign In form ── */}
      {tab === "sign-in" ? (
        <form className="space-y-4" onSubmit={handleSignIn}>
          <div className="grid grid-cols-2 gap-2 rounded-2xl border border-stone-200 bg-stone-100 p-1 dark:border-stone-700 dark:bg-stone-800">
            {([
              ["magic-link", "Pautan Email"],
              ["password", "Password"],
            ] as const).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => switchSignInMode(mode)}
                className={[
                  "rounded-xl px-3 py-2 text-sm font-medium transition",
                  signInMode === mode
                    ? "bg-white text-stone-900 shadow-sm dark:bg-stone-700 dark:text-stone-50"
                    : "text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200",
                ].join(" ")}
              >
                {label}
              </button>
            ))}
          </div>

          <p className="rounded-2xl border border-stone-200/80 bg-stone-50 px-4 py-3 text-sm leading-relaxed text-stone-600 dark:border-stone-700 dark:bg-stone-900/70 dark:text-stone-300">
            {signInMode === "magic-link"
              ? "Pilihan paling mudah untuk pengguna baru. Kami akan hantar pautan masuk ke email anda. Jika email itu belum pernah digunakan, akaun baru juga akan disediakan."
              : "Guna password jika anda sudah pernah tetapkan password untuk akaun ini."}
          </p>

          <label className={labelCls}>
            Email
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputCls}
              placeholder="you@example.com"
            />
          </label>

          {signInMode === "password" ? (
            <label className={labelCls}>
              Password
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputCls}
                placeholder="••••••••"
              />
            </label>
          ) : null}

          <button
            type="submit"
            disabled={isPending || isMagicLinkCoolingDown}
            className="w-full rounded-2xl bg-amber-600 px-4 py-3 text-sm font-medium text-amber-50 transition hover:bg-amber-500 disabled:opacity-60 dark:bg-amber-500 dark:hover:bg-amber-400"
          >
            {isPending
              ? "Menghantar..."
              : isMagicLinkCoolingDown
                ? `Cuba lagi dalam ${formatCooldownDuration(magicLinkCooldownSeconds)}`
                : signInMode === "password"
                  ? "Masuk Dengan Password"
                  : "Hantar Pautan Masuk"}
          </button>

          {signInMode === "magic-link" ? (
            <div className="rounded-2xl border border-stone-200/80 bg-stone-50 px-4 py-4 text-sm leading-relaxed text-stone-600 dark:border-stone-700 dark:bg-stone-900/70 dark:text-stone-300">
              <p className="font-medium text-stone-800 dark:text-stone-100">
                Langkah seterusnya
              </p>
              <div className="mt-3 space-y-2">
                <p>
                  Semak <span className="font-medium">Inbox</span>, kemudian lihat{" "}
                  <span className="font-medium">Spam</span> atau{" "}
                  <span className="font-medium">Promotions</span> jika email belum
                  muncul.
                </p>
                <p>
                  {isMagicLinkCoolingDown
                    ? `Sistem sedang menyejukkan percubaan baharu. Anda boleh cuba lagi dalam ${formatCooldownDuration(magicLinkCooldownSeconds)}.`
                    : "Jika email belum sampai, tunggu sekitar 1-2 minit sebelum cuba semula."}
                </p>
                <p>
                  Jika anda sudah pernah tetapkan password, tukar ke mod
                  <span className="font-medium"> Password</span> untuk masuk terus.
                </p>
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => switchSignInMode("password")}
                  className="rounded-full border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-100 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-800"
                >
                  Guna Password
                </button>
                <Link
                  href={PREVIEW_PATH}
                  className="rounded-full border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-100 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-800"
                >
                  Lihat Pratonton
                </Link>
              </div>
            </div>
          ) : null}

          {renderMessages()}
        </form>
      ) : null}

      {/* ── Sign Up form ── */}
      {tab === "sign-up" ? (
        <form className="space-y-4" onSubmit={handleSignUp}>
          <label className={labelCls}>
            Nama Paparan
            <input
              type="text"
              autoComplete="name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className={inputCls}
              placeholder="Nama anda"
            />
          </label>

          <label className={labelCls}>
            Email
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputCls}
              placeholder="you@example.com"
            />
          </label>

          <label className={labelCls}>
            Password
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
            Sahkan Password
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
            {isPending ? "Mendaftar..." : "Buat Akaun"}
          </button>

          <p className="rounded-2xl border border-stone-200/80 bg-stone-50 px-4 py-3 text-sm leading-relaxed text-stone-600 dark:border-stone-700 dark:bg-stone-900/70 dark:text-stone-300">
            Selepas daftar, semak email anda untuk pengesahan. Jika anda hanya
            mahu melihat rupa dashboard dahulu, anda masih boleh buka{" "}
            <Link href={PREVIEW_PATH} className="font-medium text-amber-700 underline dark:text-amber-300">
              pratonton
            </Link>
            .
          </p>

          {renderMessages()}
        </form>
      ) : null}
    </div>
  );

  function renderMessages() {
    return (
      <>
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
      </>
    );
  }
}
