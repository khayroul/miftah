"use client";

import { useEffect, useState } from "react";
import { onSwUpdate, skipWaitingAndReload } from "../swRegistration";

export function UpdateBanner() {
  const [showUpdate, setShowUpdate] = useState(false);

  useEffect(() => {
    return onSwUpdate(() => setShowUpdate(true));
  }, []);

  if (!showUpdate) return null;

  return (
    <div
      role="alert"
      className="fixed bottom-4 left-4 right-4 z-50 flex items-center justify-between rounded-lg px-4 py-3 shadow-lg"
      style={{ backgroundColor: "#1a1a2e", color: "#ffffff" }}
    >
      <span className="text-sm">Versi baharu tersedia</span>
      <button
        type="button"
        onClick={skipWaitingAndReload}
        className="ml-4 rounded px-3 py-1 text-sm font-medium"
        style={{ backgroundColor: "#4a90d9", color: "#ffffff" }}
      >
        Kemas kini
      </button>
    </div>
  );
}
