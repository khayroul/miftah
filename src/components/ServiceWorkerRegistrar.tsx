"use client";

import { useEffect } from "react";
import { registerServiceWorker } from "@/lib/hifz/audioPreCache";

export function ServiceWorkerRegistrar() {
  useEffect(() => {
    registerServiceWorker();
  }, []);
  return null;
}
