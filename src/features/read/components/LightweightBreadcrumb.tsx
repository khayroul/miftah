"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

export interface BreadcrumbItem {
  href?: string;
  label: string;
}

interface LightweightBreadcrumbProps {
  items: BreadcrumbItem[];
  className?: string;
}

export function LightweightBreadcrumb({
  items,
  className = "",
}: LightweightBreadcrumbProps) {
  const t = useTranslations("read.breadcrumb");
  if (items.length === 0) {
    return null;
  }

  return (
    <nav
      aria-label={t("ariaLabel")}
      className={`w-full ${className}`.trim()}
    >
      <ol className="flex flex-wrap items-center gap-1 text-xs font-medium text-stone-500 dark:text-stone-400">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li
              key={`${item.label}-${index}`}
              className="inline-flex items-center gap-1"
            >
              {item.href && !isLast ? (
                <Link
                  href={item.href}
                  className="ui-touch-target inline-flex min-h-11 min-w-11 items-center justify-center rounded px-1 transition-colors hover:bg-stone-100 hover:text-stone-800 dark:hover:bg-stone-800 dark:hover:text-stone-100"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  className={
                    isLast
                      ? "px-1 py-0.5 text-stone-700 dark:text-stone-200"
                      : "px-1 py-0.5"
                  }
                >
                  {item.label}
                </span>
              )}
              {!isLast ? <span>/</span> : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
