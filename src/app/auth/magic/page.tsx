"use client";

import { useTranslations } from "next-intl";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { buildSignInPath, sanitizeNextPath } from "@/features/auth";
import { createSupabaseBrowserClient } from "@/data/repositories/auth-browser";

function MagicLinkPageContent() {
  const t = useTranslations("auth.magicPage");
  const router = useRouter();
  const searchParams = useSearchParams();
  const [message, setMessage] = useState(t("signingInMessage"));

  useEffect(() => {
    let cancelled = false;

    async function completeMagicLinkSignIn() {
      const nextPath = sanitizeNextPath(searchParams.get("next"), "/");
      const code = searchParams.get("code");
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");

      try {
        const supabase = createSupabaseBrowserClient();

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);

          if (error) {
            throw error;
          }

          if (!cancelled) {
            setMessage(t("successMessage"));
          }
          router.replace(nextPath);
          router.refresh();
          return;
        }

        if (!accessToken || !refreshToken) {
          router.replace(`${buildSignInPath(nextPath)}&error=callback`);
          return;
        }

        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        if (error) {
          console.error("[auth/magic] Failed to set session:", error);
          if (!cancelled) {
            setMessage(t("failureMessage"));
          }
          router.replace(`${buildSignInPath(nextPath)}&error=callback`);
          return;
        }

        if (!cancelled) {
          setMessage(t("successMessage"));
        }
        router.replace(nextPath);
        router.refresh();
      } catch (error) {
        console.error("[auth/magic] Unexpected error:", error);
        if (!cancelled) {
          setMessage(t("failureMessage"));
        }
        router.replace(`${buildSignInPath(nextPath)}&error=callback`);
      }
    }

    void completeMagicLinkSignIn();

    return () => {
      cancelled = true;
    };
  }, [router, searchParams, t]);

  return (
    <main className="relative mx-auto flex min-h-screen w-full max-w-xl items-center justify-center px-4 py-12">
      <div className="w-full rounded-3xl border border-stone-200/80 bg-white/85 p-8 text-center shadow-sm backdrop-blur-sm dark:border-stone-700 dark:bg-stone-900/80">
        <h1 className="text-2xl font-semibold text-stone-900 dark:text-stone-50">
          {t("title")}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-stone-600 dark:text-stone-300">
          {message}
        </p>
      </div>
    </main>
  );
}

function MagicLinkPageFallback() {
  const t = useTranslations("auth.magicPage");

  return (
    <main className="relative mx-auto flex min-h-screen w-full max-w-xl items-center justify-center px-4 py-12">
      <div className="w-full rounded-3xl border border-stone-200/80 bg-white/85 p-8 text-center shadow-sm backdrop-blur-sm dark:border-stone-700 dark:bg-stone-900/80">
        <h1 className="text-2xl font-semibold text-stone-900 dark:text-stone-50">
          {t("title")}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-stone-600 dark:text-stone-300">
          {t("preparingMessage")}
        </p>
      </div>
    </main>
  );
}

export default function MagicLinkPage() {
  return (
    <Suspense fallback={<MagicLinkPageFallback />}>
      <MagicLinkPageContent />
    </Suspense>
  );
}
