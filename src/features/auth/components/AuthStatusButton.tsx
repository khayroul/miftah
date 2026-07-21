"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  createSupabaseBrowserClient,
  type AuthChangeEvent,
  type User,
} from "@/data/repositories/auth-browser";
import { buildSignInPath } from "../domain/navigation";

function shouldRefreshForAuthEvent(event: AuthChangeEvent): boolean {
  return event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED";
}

export function AuthStatusButton() {
  const t = useTranslations("auth");
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const menuRef = useRef<HTMLDivElement | null>(null);
  const nextPath = pathname || "/";

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let active = true;

    // Read current auth state from local session first so offline/PWA contexts
    // don't flap between signed-in/out when network checks fail transiently.
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) {
        return;
      }
      setUser(data.session?.user ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) {
        return;
      }
      setUser(session?.user ?? null);
      if (navigator.onLine && shouldRefreshForAuthEvent(event)) {
        router.refresh();
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [router]);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  if (!user) {
    return (
      <Link
        href={buildSignInPath(nextPath)}
        className="inline-flex min-h-11 items-center rounded-full border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-900 shadow-sm transition hover:bg-amber-100 dark:border-amber-700/50 dark:bg-amber-900/25 dark:text-amber-100 dark:hover:bg-amber-900/40"
      >
        {t("signIn")}
      </Link>
    );
  }

  const displayName =
    typeof user.user_metadata?.display_name === "string" &&
    user.user_metadata.display_name.trim().length > 0
      ? user.user_metadata.display_name.trim()
      : user.email?.split("@")[0] ?? t("defaultUserName");
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        disabled={isPending}
        onClick={() => setMenuOpen((current) => !current)}
        className="inline-flex min-h-11 items-center gap-2 rounded-full border border-stone-200 bg-white/95 px-3 py-2 text-sm font-medium text-stone-700 shadow-sm transition hover:bg-stone-50 disabled:opacity-60 dark:border-stone-700 dark:bg-stone-900/90 dark:text-stone-200 dark:hover:bg-stone-800"
        aria-expanded={menuOpen}
        aria-haspopup="menu"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-stone-900 text-xs font-semibold text-stone-50 dark:bg-stone-100 dark:text-stone-900">
          {initial}
        </span>
        <span>{isPending ? t("signingOut") : t("signedIn")}</span>
        <svg
          className={`h-4 w-4 transition ${menuOpen ? "rotate-180" : ""}`}
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.51a.75.75 0 01-1.08 0l-4.25-4.51a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {menuOpen ? (
        <div className="absolute right-0 z-20 mt-2 w-64 rounded-3xl border border-stone-200 bg-white/98 p-3 shadow-[0_24px_80px_-40px_rgba(28,25,23,0.55)] backdrop-blur-sm dark:border-stone-700 dark:bg-stone-900/96">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-stone-500 dark:text-stone-400">
            {t("accountLabel")}
          </p>
          <p className="mt-3 text-sm font-medium text-stone-900 dark:text-stone-50">
            {displayName}
          </p>
          {user.email ? (
            <p className="mt-1 break-all text-sm text-stone-600 dark:text-stone-300">
              {user.email}
            </p>
          ) : null}

          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              startTransition(() => {
                const supabase = createSupabaseBrowserClient();
                void supabase.auth.signOut().then(() => {
                  setMenuOpen(false);
                  setUser(null);
                  window.location.assign("/");
                });
              });
            }}
            className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-2xl border border-stone-200 bg-stone-50 px-4 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-100 disabled:opacity-60 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700"
          >
            {isPending ? t("signingOut") : t("signOut")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
