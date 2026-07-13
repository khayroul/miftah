"use client";

import { useEffect, useState, useTransition } from "react";
import {
  buildMagicLinkPath,
  formatCooldownDuration,
  getMagicLinkCooldownSeconds,
  type AuthErrorLike,
} from "../domain/navigation";
import { createSupabaseBrowserClient } from "@/data/repositories/auth-browser";
import {
  AuthSignInPanel,
  AuthSignUpPanel,
  GoogleIcon,
  SEGMENTED_BUTTON_CLASS,
  type SignInMode,
} from "./AuthSignInPanels";

type AuthTab = "sign-in" | "sign-up";

const MAGIC_LINK_COOLDOWN_STORAGE_KEY = "miftah.auth.magic-link-cooldown-until";

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

  function clearMagicLinkCooldown() {
    setMagicLinkCooldownUntil(null);
    window.localStorage.removeItem(MAGIC_LINK_COOLDOWN_STORAGE_KEY);
  }

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

    // Restore the external localStorage clock into React on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMagicLinkCooldownUntil(parsedValue);
  }, []);

  useEffect(() => {
    if (magicLinkCooldownUntil === null) {
      return;
    }

    if (magicLinkCooldownUntil <= Date.now()) {
      // Keep React state and localStorage synchronized when the clock expires.
      // eslint-disable-next-line react-hooks/set-state-in-effect
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

  function startMagicLinkCooldown(seconds: number) {
    const cooldownUntil = Date.now() + seconds * 1000;
    setNowMs(Date.now());
    setMagicLinkCooldownUntil(cooldownUntil);
    window.localStorage.setItem(
      MAGIC_LINK_COOLDOWN_STORAGE_KEY,
      cooldownUntil.toString(),
    );
  }

  function redirectToNextPath() {
    window.location.assign(nextPath);
  }

  function handleGoogleSignIn() {
    const supabase = createSupabaseBrowserClient();
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`;
    void supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
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
            redirectToNextPath();
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
          redirectToNextPath();
        });
    });
  }

  return (
    <div className="space-y-5">
      {/* Google OAuth */}
      <button
        type="button"
        onClick={handleGoogleSignIn}
        className="flex w-full items-center justify-center gap-3 rounded-2xl border border-stone-300 bg-white px-4 py-3 text-sm font-medium text-stone-700 transition hover:bg-stone-50 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700"
      >
        <GoogleIcon />
        Masuk dengan Google
      </button>

      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-stone-200 dark:bg-stone-700" />
        <span className="text-xs text-stone-400 dark:text-stone-500">atau</span>
        <div className="h-px flex-1 bg-stone-200 dark:bg-stone-700" />
      </div>

      {/* Tab switcher */}
      <div className="flex rounded-2xl border border-stone-200 bg-stone-100 p-1 dark:border-stone-700 dark:bg-stone-800">
        {(["sign-in", "sign-up"] as AuthTab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => switchTab(t)}
            className={[
              SEGMENTED_BUTTON_CLASS,
              "flex-1",
              tab === t
                ? "bg-white shadow-sm dark:bg-stone-700 text-stone-900 dark:text-stone-50"
                : "text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200",
            ].join(" ")}
            aria-pressed={tab === t}
          >
            {t === "sign-in" ? "Masuk" : "Daftar"}
          </button>
        ))}
      </div>

      {tab === "sign-in" ? (
        <AuthSignInPanel
          email={email}
          password={password}
          signInMode={signInMode}
          isPending={isPending}
          isMagicLinkCoolingDown={isMagicLinkCoolingDown}
          magicLinkCooldownSeconds={magicLinkCooldownSeconds}
          nextPath={nextPath}
          feedback={feedback}
          errorMessage={errorMessage}
          onEmailChange={setEmail}
          onPasswordChange={setPassword}
          onModeChange={switchSignInMode}
          onSubmit={handleSignIn}
        />
      ) : null}

      {tab === "sign-up" ? (
        <AuthSignUpPanel
          displayName={displayName}
          email={email}
          password={password}
          confirmPassword={confirmPassword}
          isPending={isPending}
          feedback={feedback}
          errorMessage={errorMessage}
          onDisplayNameChange={setDisplayName}
          onEmailChange={setEmail}
          onPasswordChange={setPassword}
          onConfirmPasswordChange={setConfirmPassword}
          onSubmit={handleSignUp}
        />
      ) : null}
    </div>
  );
}
