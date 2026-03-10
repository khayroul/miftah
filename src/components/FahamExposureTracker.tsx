"use client";

import { useEffect } from "react";
import { buildFahamSourceKey } from "@/lib/faham/source-key";
import type { FahamExposureInput } from "@/lib/faham/types";

const SESSION_KEY_PREFIX = "miftah:faham:exposure:";

export function FahamExposureTracker({
  payload,
}: {
  payload: FahamExposureInput;
}) {
  const sourceKey = buildFahamSourceKey(payload);
  const ayahKey = payload.ayahIds.join(",");

  useEffect(() => {
    if (typeof window === "undefined" || payload.ayahIds.length === 0) {
      return;
    }

    const sessionKey = `${SESSION_KEY_PREFIX}${sourceKey}`;
    try {
      if (window.sessionStorage.getItem(sessionKey) === "1") {
        return;
      }
      window.sessionStorage.setItem(sessionKey, "1");
    } catch {
      return;
    }

    let completed = false;
    void fetch("/api/faham/exposure", {
      body: JSON.stringify(payload),
      headers: {
        "Content-Type": "application/json",
      },
      keepalive: true,
      method: "POST",
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error("Exposure request failed");
        }
        completed = true;
      })
      .catch(() => {
        if (completed) {
          return;
        }

        try {
          window.sessionStorage.removeItem(sessionKey);
        } catch {
          // Ignore storage failures; exposure logging must stay non-blocking.
        }
      });
  }, [ayahKey, payload, sourceKey]);

  return null;
}
