"use client";

import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { MouseEvent } from "react";

function isReadDocumentRoute(href: string): boolean {
  return (
    /^\/read\/\d+\/?(?:\?.*)?$/.test(href) ||
    /^\/read\/surah\/\d+\/themes\/?(?:\?.*)?$/.test(href)
  );
}

function canUseDocumentNavigation(href: string): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  if (navigator.onLine === false) {
    return true;
  }

  // Reader routes perform better through document navigation because the
  // service worker can serve cached HTML immediately while revalidating.
  return isReadDocumentRoute(href);
}

function isModifiedClick(event: MouseEvent): boolean {
  return (
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey ||
    event.button !== 0
  );
}

export function maybeHandleOfflineDocumentNavigation(
  event: MouseEvent,
  href: string,
): boolean {
  if (!canUseDocumentNavigation(href) || isModifiedClick(event)) {
    return false;
  }

  event.preventDefault();
  window.location.assign(href);
  return true;
}

export function navigateWithOfflineSupport(
  router: AppRouterInstance,
  href: string,
): void {
  if (canUseDocumentNavigation(href)) {
    window.location.assign(href);
    return;
  }

  router.push(href);
}

export function prefetchWithOfflineSupport(
  router: AppRouterInstance,
  href: string,
): void {
  if (canUseDocumentNavigation(href)) {
    return;
  }

  router.prefetch(href);
}
