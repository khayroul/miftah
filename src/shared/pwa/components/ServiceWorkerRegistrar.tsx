"use client";

import { useEffect } from "react";
import { registerServiceWorker } from "../swRegistration";

export function ServiceWorkerRegistrar() {
  useEffect(() => {
    registerServiceWorker();
  }, []);
  return null;
}
