"use client";

import { useEffect } from "react";
import { registerServiceWorker } from "@/lib/pwa/swRegistration";

export function ServiceWorkerRegistrar() {
  useEffect(() => {
    registerServiceWorker();
  }, []);
  return null;
}
