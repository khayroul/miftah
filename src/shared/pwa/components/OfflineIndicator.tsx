"use client";

import { useTranslations } from "next-intl";
import { useOnlineStatus } from "../offlineDetection";
import { useEffect, useRef, useState } from "react";

export function OfflineIndicator() {
  const t = useTranslations("pwa");
  const isOnline = useOnlineStatus();
  const [showReconnected, setShowReconnected] = useState(false);
  const wasOfflineRef = useRef(false);

  useEffect(() => {
    if (!isOnline) {
      wasOfflineRef.current = true;
      return;
    }

    if (!wasOfflineRef.current) return;

    wasOfflineRef.current = false;
    // Defer state updates into timers so they are not synchronous in the effect body.
    const showTimer = setTimeout(() => setShowReconnected(true), 0);
    const hideTimer = setTimeout(() => setShowReconnected(false), 3000);
    return () => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
    };
  }, [isOnline]);

  if (isOnline && !showReconnected) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-0 left-0 right-0 z-50 text-center text-sm py-1 transition-colors duration-300"
      style={{
        backgroundColor: isOnline ? "#2d6a4f" : "#495057",
        color: "#ffffff",
      }}
    >
      {isOnline ? t("offlineIndicatorOnline") : t("offlineIndicatorOffline")}
    </div>
  );
}
