"use client";

import { useOnlineStatus } from "@/lib/pwa/offlineDetection";
import { useEffect, useState } from "react";

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();
  const [showReconnected, setShowReconnected] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    if (!isOnline) {
      setWasOffline(true);
    } else if (wasOffline) {
      setShowReconnected(true);
      const timer = setTimeout(() => {
        setShowReconnected(false);
        setWasOffline(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [isOnline, wasOffline]);

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
      {isOnline ? "Kembali dalam talian" : "Luar talian"}
    </div>
  );
}
