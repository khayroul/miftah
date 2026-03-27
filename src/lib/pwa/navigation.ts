"use client";

import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { MouseEvent } from "react";

function canUseDocumentNavigation(): boolean {
  return typeof window !== "undefined" && navigator.onLine === false;
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
  if (!canUseDocumentNavigation() || isModifiedClick(event)) {
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
  if (canUseDocumentNavigation()) {
    window.location.assign(href);
    return;
  }

  router.push(href);
}

export function prefetchWithOfflineSupport(
  router: AppRouterInstance,
  href: string,
): void {
  if (canUseDocumentNavigation()) {
    return;
  }

  router.prefetch(href);
}
