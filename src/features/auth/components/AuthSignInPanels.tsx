import Link from "next/link";
import type { FormEventHandler } from "react";
import { formatCooldownDuration } from "../domain/navigation";

export type SignInMode = "password" | "magic-link";

export const SEGMENTED_BUTTON_CLASS =
  "flex min-h-11 touch-manipulation items-center justify-center rounded-xl px-3 py-2 text-sm font-medium transition";

const PREVIEW_PATH = "/dashboard-preview";
const INPUT_CLASS =
  "mt-2 w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-sm text-stone-900 outline-none transition focus:border-amber-500 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100 dark:focus:border-amber-500";
const LABEL_CLASS = "block text-sm font-medium text-stone-700 dark:text-stone-200";

export function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z"
        fill="#4285F4"
      />
      <path
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"
        fill="#34A853"
      />
      <path
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z"
        fill="#EA4335"
      />
    </svg>
  );
}

function AuthMessages({
  feedback,
  errorMessage,
}: {
  feedback: string | null;
  errorMessage: string | null;
}) {
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

export function AuthSignInPanel({
  email,
  password,
  signInMode,
  isPending,
  isMagicLinkCoolingDown,
  magicLinkCooldownSeconds,
  nextPath,
  feedback,
  errorMessage,
  onEmailChange,
  onPasswordChange,
  onModeChange,
  onSubmit,
}: {
  email: string;
  password: string;
  signInMode: SignInMode;
  isPending: boolean;
  isMagicLinkCoolingDown: boolean;
  magicLinkCooldownSeconds: number;
  nextPath: string;
  feedback: string | null;
  errorMessage: string | null;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onModeChange: (mode: SignInMode) => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
}) {
  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <div className="grid grid-cols-2 gap-2 rounded-2xl border border-stone-200 bg-stone-100 p-1 dark:border-stone-700 dark:bg-stone-800">
        {([
          ["magic-link", "Pautan Email"],
          ["password", "Password"],
        ] as const).map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            onClick={() => onModeChange(mode)}
            className={[
              SEGMENTED_BUTTON_CLASS,
              signInMode === mode
                ? "bg-white text-stone-900 shadow-sm dark:bg-stone-700 dark:text-stone-50"
                : "text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200",
            ].join(" ")}
            aria-pressed={signInMode === mode}
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

      <label className={LABEL_CLASS}>
        Email
        <input
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => onEmailChange(event.target.value)}
          className={INPUT_CLASS}
          placeholder="you@example.com"
        />
      </label>

      {signInMode === "password" ? (
        <>
          <label className={LABEL_CLASS}>
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => onPasswordChange(event.target.value)}
              className={INPUT_CLASS}
              placeholder="••••••••"
            />
          </label>
          <div className="text-right">
            <Link
              href={`/auth/forgot-password?next=${encodeURIComponent(nextPath)}`}
              className="text-sm font-medium text-amber-700 hover:text-amber-600 dark:text-amber-400 dark:hover:text-amber-300"
            >
              Lupa password?
            </Link>
          </div>
        </>
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
              onClick={() => onModeChange("password")}
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

      <AuthMessages feedback={feedback} errorMessage={errorMessage} />
    </form>
  );
}

export function AuthSignUpPanel({
  displayName,
  email,
  password,
  confirmPassword,
  isPending,
  feedback,
  errorMessage,
  onDisplayNameChange,
  onEmailChange,
  onPasswordChange,
  onConfirmPasswordChange,
  onSubmit,
}: {
  displayName: string;
  email: string;
  password: string;
  confirmPassword: string;
  isPending: boolean;
  feedback: string | null;
  errorMessage: string | null;
  onDisplayNameChange: (value: string) => void;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onConfirmPasswordChange: (value: string) => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
}) {
  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <label className={LABEL_CLASS}>
        Nama Paparan
        <input
          type="text"
          autoComplete="name"
          value={displayName}
          onChange={(event) => onDisplayNameChange(event.target.value)}
          className={INPUT_CLASS}
          placeholder="Nama anda"
        />
      </label>

      <label className={LABEL_CLASS}>
        Email
        <input
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => onEmailChange(event.target.value)}
          className={INPUT_CLASS}
          placeholder="you@example.com"
        />
      </label>

      <label className={LABEL_CLASS}>
        Password
        <input
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => onPasswordChange(event.target.value)}
          className={INPUT_CLASS}
          placeholder="Min. 6 aksara"
        />
      </label>

      <label className={LABEL_CLASS}>
        Sahkan Password
        <input
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(event) => onConfirmPasswordChange(event.target.value)}
          className={INPUT_CLASS}
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
        Selepas daftar, semak email anda untuk pengesahan. Jika anda hanya mahu
        melihat rupa dashboard dahulu, anda masih boleh buka{" "}
        <Link
          href={PREVIEW_PATH}
          className="font-medium text-amber-700 underline dark:text-amber-300"
        >
          pratonton
        </Link>
        .
      </p>

      <AuthMessages feedback={feedback} errorMessage={errorMessage} />
    </form>
  );
}
