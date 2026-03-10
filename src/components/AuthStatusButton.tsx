"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import type { User } from "@supabase/supabase-js";
import { buildSignInPath } from "@/lib/auth";
import { createSupabaseBrowserClient } from "@/lib/supabase-auth";

export function AuthStatusButton() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<User | null>(null);
  const [isPending, startTransition] = useTransition();

  const nextPath = useMemo(() => {
    const query = searchParams.toString();
    return `${pathname}${query ? `?${query}` : ""}`;
  }, [pathname, searchParams]);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    void supabase.auth.getUser().then(({ data }) => {
      setUser(data.user ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      router.refresh();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [router]);

  if (!user) {
    return (
      <Link
        href={buildSignInPath(nextPath)}
        className="rounded-full border border-amber-300 bg-amber-50 px-4 py-1.5 text-sm font-medium text-amber-900 shadow-sm transition hover:bg-amber-100 dark:border-amber-700/50 dark:bg-amber-900/25 dark:text-amber-100 dark:hover:bg-amber-900/40"
      >
        Sign In
      </Link>
    );
  }

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => {
        startTransition(() => {
          const supabase = createSupabaseBrowserClient();
          void supabase.auth.signOut().then(() => {
            setUser(null);
            router.push("/");
            router.refresh();
          });
        });
      }}
      className="rounded-full border border-stone-200 bg-white px-4 py-1.5 text-sm font-medium text-stone-700 shadow-sm transition hover:bg-stone-50 disabled:opacity-60 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700"
    >
      {isPending ? "Signing out..." : user.email ?? "Sign Out"}
    </button>
  );
}
