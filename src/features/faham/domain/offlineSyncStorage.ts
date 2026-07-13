"use client";

export function getOfflineStorage(): Storage | null {
  if (typeof localStorage === "undefined") {
    return null;
  }

  try {
    return localStorage;
  } catch {
    return null;
  }
}

export function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function parseJson(raw: string): unknown | null {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
